## Data Format for /yaml_v1

### Request (POST)
```json
{
  "nodes": [
    {
      "id": "string",
      "type": "http-request" | "send-email" | "delay" | "log",
      "position": { "x": number, "y": number },  // optional, for layout
      "data": {
        // fields depend on type
        // example for http-request:
        "url": "string",
        "method": "GET" | "POST" | "PUT" | "DELETE",
        "headers": { "key": "value" },
        "body": "string"
        // for send-email:
        // "to": "string", "subject": "string", "body": "string"
        // for delay:
        // "seconds": number
        // for log:
        // "message": "string"
      }
    }
  ],
  "edges": [
    {
      "id": "string",
      "source": "nodeId",
      "target": "nodeId",
      "sourceHandle": "string | null",  // optional if multiple ports
      "targetHandle": "string | null"
    }
  ]
}
```

### Response
**Success (200):**  
Content-Type: `application/json`  
```json
{
  "yaml": "steps:\n  - id: node1\n    type: http-request\n    config:\n      url: https://api.example.com\n      method: GET\n  - id: node2\n    type: send-email\n    config:\n      to: user@example.com\n      subject: Done\n      body: Workflow finished"
}
```

**Error (400):**  
```json
{ "error": "Invalid node configuration" }
```

### Generated YAML Structure
```yaml
steps:
  - id: <node.id>
    type: <node.type>
    config:
      # flattened node.data fields
  # order determined by edge topology (topological sort)
```

### Edge Handling
- Edges define execution order (directed acyclic graph).  
- The backend must validate no cycles and produce a linear sequence of steps.  
- If multiple outgoing edges, the workflow branches are not supported in MVP; linear sequence only.
