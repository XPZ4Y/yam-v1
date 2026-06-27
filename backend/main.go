package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"strings"
)

type Position struct {
	X float64 `json:"x"`
	Y float64 `json:"y"`
}

type Node struct {
	ID       string                 `json:"id"`
	Type     string                 `json:"type"`
	Position *Position              `json:"position,omitempty"`
	Data     map[string]interface{} `json:"data"`
}

type Edge struct {
	ID           string  `json:"id"`
	Source       string  `json:"source"`
	Target       string  `json:"target"`
	SourceHandle *string `json:"sourceHandle,omitempty"`
	TargetHandle *string `json:"targetHandle,omitempty"`
}

type Request struct {
	Nodes []Node `json:"nodes"`
	Edges []Edge `json:"edges"`
}

type YAMLOutput struct {
	YAML string `json:"yaml"`
}

func ConvertToYAML(input []byte) ([]byte, error) {
	var req Request
	if err := json.Unmarshal(input, &req); err != nil {
		return nil, errors.New("invalid JSON format")
	}

	if len(req.Nodes) == 0 {
		return nil, errors.New("no nodes provided")
	}

	nodeMap := make(map[string]Node)
	for _, n := range req.Nodes {
		nodeMap[n.ID] = n
	}

	order, err := topologicalSort(req.Edges, req.Nodes)
	if err != nil {
		return nil, err
	}

	var steps []string
	for _, id := range order {
		node := nodeMap[id]
		step := buildStep(node)
		steps = append(steps, step)
	}

	yaml := "steps:\n" + strings.Join(steps, "\n")
	resp := YAMLOutput{YAML: yaml}
	return json.Marshal(resp)
}

func topologicalSort(edges []Edge, nodes []Node) ([]string, error) {
	graph := make(map[string][]string)
	inDegree := make(map[string]int)
	nodeIDs := make(map[string]bool)

	for _, n := range nodes {
		nodeIDs[n.ID] = true
		inDegree[n.ID] = 0
	}

	for _, e := range edges {
		if _, ok := nodeIDs[e.Source]; !ok {
			return nil, errors.New("edge source not found")
		}
		if _, ok := nodeIDs[e.Target]; !ok {
			return nil, errors.New("edge target not found")
		}
		graph[e.Source] = append(graph[e.Source], e.Target)
		inDegree[e.Target]++
	}

	var queue []string
	for id, deg := range inDegree {
		if deg == 0 {
			queue = append(queue, id)
		}
	}

	var result []string
	for len(queue) > 0 {
		id := queue[0]
		queue = queue[1:]
		result = append(result, id)

		for _, neighbor := range graph[id] {
			inDegree[neighbor]--
			if inDegree[neighbor] == 0 {
				queue = append(queue, neighbor)
			}
		}
	}

	if len(result) != len(nodes) {
		return nil, errors.New("cycle detected in workflow")
	}

	return result, nil
}

func buildStep(node Node) string {
	var config string
	switch node.Type {
	case "http-request":
		config = buildHTTPConfig(node.Data)
	case "send-email":
		config = buildEmailConfig(node.Data)
	case "delay":
		config = buildDelayConfig(node.Data)
	case "log":
		config = buildLogConfig(node.Data)
	default:
		config = buildGenericConfig(node.Data)
	}

	return fmt.Sprintf("  - id: %s\n    type: %s\n    config:%s", node.ID, node.Type, config)
}

func buildHTTPConfig(data map[string]interface{}) string {
	var parts []string
	if url, ok := data["url"].(string); ok {
		parts = append(parts, fmt.Sprintf("      url: %s", url))
	}
	if method, ok := data["method"].(string); ok {
		parts = append(parts, fmt.Sprintf("      method: %s", method))
	}
	if headers, ok := data["headers"].(map[string]interface{}); ok && len(headers) > 0 {
		parts = append(parts, "      headers:")
		for k, v := range headers {
			parts = append(parts, fmt.Sprintf("        %s: %v", k, v))
		}
	}
	if body, ok := data["body"].(string); ok && body != "" {
		parts = append(parts, fmt.Sprintf("      body: %s", body))
	}
	if len(parts) == 0 {
		return "\n      {}"
	}
	return "\n" + strings.Join(parts, "\n")
}

func buildEmailConfig(data map[string]interface{}) string {
	var parts []string
	if to, ok := data["to"].(string); ok {
		parts = append(parts, fmt.Sprintf("      to: %s", to))
	}
	if subject, ok := data["subject"].(string); ok {
		parts = append(parts, fmt.Sprintf("      subject: %s", subject))
	}
	if body, ok := data["body"].(string); ok {
		parts = append(parts, fmt.Sprintf("      body: %s", body))
	}
	if len(parts) == 0 {
		return "\n      {}"
	}
	return "\n" + strings.Join(parts, "\n")
}

func buildDelayConfig(data map[string]interface{}) string {
	if seconds, ok := data["seconds"].(float64); ok {
		return fmt.Sprintf("\n      seconds: %v", seconds)
	}
	return "\n      {}"
}

func buildLogConfig(data map[string]interface{}) string {
	if msg, ok := data["message"].(string); ok {
		return fmt.Sprintf("\n      message: %s", msg)
	}
	return "\n      {}"
}

func buildGenericConfig(data map[string]interface{}) string {
	if len(data) == 0 {
		return "\n      {}"
	}
	var parts []string
	for k, v := range data {
		parts = append(parts, fmt.Sprintf("      %s: %v", k, v))
	}
	return "\n" + strings.Join(parts, "\n")
}
