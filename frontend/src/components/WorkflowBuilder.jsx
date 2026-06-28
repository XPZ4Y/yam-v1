import React, { useState, useCallback, useEffect } from 'react';
import { ReactFlow, Background, Controls, addEdge, applyNodeChanges, applyEdgeChanges, useReactFlow, ReactFlowProvider } from '@xyflow/react';
import '@xyflow/react/dist/style.css';

const nodeTypesList = [
  { type: 'execute-branch', label: 'Execute Workflow on Branch' },
  { type: 'container-setup', label: 'Container Setup' },
  { type: 'echo', label: 'Echo' },
  { type: 'checkout', label: 'Checkout Code' },
  { type: 'setup-go', label: 'Setup Go' },
  { type: 'run-script', label: 'Run Script' },
  { type: 'upload-artifact', label: 'Upload Artifact' },
  { type: 'download-artifact', label: 'Download Artifact' }
];

const bounds = [[-2000, -2000], [2000, 2000]];

const generateYamlLocally = (nodes, edges) => {
  if (nodes.length === 0) return '# No nodes added yet.';
  const inDegree = {};
  const graph = {};

  nodes.forEach(n => {
    inDegree[n.id] = 0;
    graph[n.id] = [];
  });

  edges.forEach(e => {
    if (inDegree[e.target] !== undefined && inDegree[e.source] !== undefined) {
      inDegree[e.target]++;
      graph[e.source].push(e.target);
    }
  });

  const queue = [];
  nodes.forEach(n => {
    if (inDegree[n.id] === 0) queue.push(n.id);
  });

  const order = [];
  while (queue.length > 0) {
    const id = queue.shift();
    order.push(id);
    graph[id].forEach(neighbor => {
      inDegree[neighbor]--;
      if (inDegree[neighbor] === 0) queue.push(neighbor);
    });
  }

  if (order.length !== nodes.length) {
    return '# Error: Cycle detected in workflow graph.\n# Please ensure arrows flow in one direction.';
  }

  let yaml = 'steps:\n';
  order.forEach(id => {
    const node = nodes.find(n => n.id === id);
    if (!node) return;

    yaml += `  - id: ${node.id}\n`;
    yaml += `    type: ${node.type}\n`;
    yaml += `    config:\n`;

    let hasConfig = false;
    for (const [key, value] of Object.entries(node.data)) {
      if (key !== 'label') {
        let printVal = value;
        if (typeof value === 'object') {
          printVal = Object.keys(value).length === 0 ? '{}' : JSON.stringify(value);
        } else if (value === '') {
          printVal = '""';
        }
        yaml += `      ${key}: ${printVal}\n`;
        hasConfig = true;
      }
    }
    if (!hasConfig) yaml += `      {}\n`;
  });

  return yaml;
};

function WorkflowCanvas() {
  const [nodes, setNodes] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('yamal_nodes');
      return saved ? JSON.parse(saved) : [];
    }
    return [];
  });

  const [edges, setEdges] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('yamal_edges');
      return saved ? JSON.parse(saved) : [];
    }
    return [];
  });

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [currentYaml, setCurrentYaml] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('yamal_current_yaml') || '';
    }
    return '';
  });
  const [copyStatus, setCopyStatus] = useState('Copy to Clipboard');

  const [hoveredNodeId, setHoveredNodeId] = useState(null);
  const [hoveredEdgeId, setHoveredEdgeId] = useState(null);
  const [trashPosition, setTrashPosition] = useState({ top: 0, left: 0 });

  // Access canvas context metrics API
  const { screenToFlowPosition } = useReactFlow();

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('yamal_nodes', JSON.stringify(nodes));
      localStorage.setItem('yamal_edges', JSON.stringify(edges));
      const newYaml = generateYamlLocally(nodes, edges);
      localStorage.setItem('yamal_current_yaml', newYaml);
      setCurrentYaml(newYaml);
    }
  }, [nodes, edges]);

  const onNodesChange = useCallback((changes) => setNodes((nds) => applyNodeChanges(changes, nds)), []);
  const onEdgesChange = useCallback((changes) => setEdges((eds) => applyEdgeChanges(changes, eds)), []);
  const onConnect = useCallback((params) => setEdges((eds) => addEdge(params, eds)), []);

  const onDragStart = (event, nodeType) => {
    event.dataTransfer.setData('application/reactflow', nodeType);
    event.dataTransfer.effectAllowed = 'move';
  };

  const onDragOver = useCallback((event) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback((event) => {
    event.preventDefault();
    const type = event.dataTransfer.getData('application/reactflow');
    if (!type) return;

    // Convert absolute screen client coordinates into canvas internal flow metrics
    const position = screenToFlowPosition({
      x: event.clientX,
      y: event.clientY,
    });
    
    const newNode = {
      id: `${type}_${Date.now()}`,
      type,
      position,
      data: { 
        label: nodeTypesList.find(n => n.type === type)?.label,
        ...(type === 'execute-branch' && { branch_name: 'master' }),
        ...(type === 'container-setup' && { params: {} }),
        ...(type === 'echo' && { message: '' }),
        ...(type === 'checkout' && { uses: 'actions/checkout@v4' }),
        ...(type === 'setup-go' && { uses: 'actions/setup-go@v5', 'go-version': '1.21' }),
        ...(type === 'run-script' && { run: 'echo "hello world"' }),
        ...(type === 'upload-artifact' && { uses: 'actions/upload-artifact@v4', name: 'artifact-name', path: './path' }),
        ...(type === 'download-artifact' && { uses: 'actions/download-artifact@v4', name: 'artifact-name', path: './path' })
      },
    };
    setNodes((nds) => nds.concat(newNode));
  }, [screenToFlowPosition]);

  const handleCopy = () => {
    navigator.clipboard.writeText(currentYaml);
    setCopyStatus('Copied!');
    setTimeout(() => setCopyStatus('Copy to Clipboard'), 2000);
  };

  const deleteNode = (id) => {
    setNodes((nds) => nds.filter((n) => n.id !== id));
    setEdges((eds) => eds.filter((e) => e.source !== id && e.target !== id));
    setHoveredNodeId(null);
  };

  const deleteEdge = (id) => {
    setEdges((eds) => eds.filter((e) => e.id !== id));
    setHoveredEdgeId(null);
  };

  const resetWorkflow = () => {
    setNodes([]);
    setEdges([]);
    if (typeof window !== 'undefined') {
      localStorage.removeItem('yamal_nodes');
      localStorage.removeItem('yamal_edges');
      localStorage.removeItem('yamal_current_yaml');
    }
  };

  const handleNodeMouseEnter = (event, node) => {
    const rect = event.target.getBoundingClientRect();
    setHoveredNodeId(node.id);
    setTrashPosition({
      top: rect.top + window.scrollY - 15,
      left: rect.right + window.scrollX - 10,
    });
  };

  const handleEdgeMouseEnter = (event, edge) => {
    setHoveredEdgeId(edge.id);
    setTrashPosition({
      top: event.clientY - 15,
      left: event.clientX - 15,
    });
  };

  return (
    <div className="dark-theme-wrapper" style={{ display: 'flex', width: '100vw', height: '100vh', backgroundColor: '#191919' }}>
      
      <aside className="sidebar" style={{ display: 'flex', flexDirection: 'column', width: '260px', background: '#222', padding: '20px', borderRight: '1px solid #333', color: '#E6E6E6', zIndex: 10, overflowY: 'auto' }}>
        <h3 style={{ marginTop: 0 }}>Nodes</h3>
        <div style={{ flexGrow: 1 }}>
          {nodeTypesList.map((n) => (
            <div
              key={n.type}
              onDragStart={(e) => onDragStart(e, n.type)}
              draggable
              style={{ background: '#2A2A2A', padding: '12px', marginBottom: '10px', borderRadius: '4px', cursor: 'grab', border: '1px solid #444', fontSize: '14px' }}
            >
              {n.label}
            </div>
          ))}
        </div>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '20px' }}>
          <button 
            onClick={resetWorkflow} 
            style={{ width: '100%', padding: '12px', background: '#444', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}
          >
            Reset
          </button>
          <button 
            onClick={() => setIsModalOpen(true)} 
            style={{ width: '100%', padding: '12px', background: 'linear-gradient(83.21deg, #3245ff 0%, #bc52ee 100%)', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}
          >
            View YAML
          </button>
        </div>
      </aside>
      
      <div 
        className="canvas-container" 
        style={{ flexGrow: 1, height: '100%', position: 'relative' }} 
        onDragOver={onDragOver} 
        onDrop={onDrop}
      >
        <ReactFlow 
          nodes={nodes} 
          edges={edges} 
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeMouseEnter={handleNodeMouseEnter}
          onNodeMouseLeave={() => setHoveredNodeId(null)}
          onEdgeMouseEnter={handleEdgeMouseEnter}
          onEdgeMouseLeave={() => setHoveredEdgeId(null)}
          translateExtent={bounds}
          nodeExtent={bounds}
          fitView 
        >
          <Background color="#333" gap={16} size={1} />
          <Controls />
        </ReactFlow>

        {hoveredNodeId && (
          <button
            onMouseEnter={() => setHoveredNodeId(hoveredNodeId)}
            onMouseLeave={() => setHoveredNodeId(null)}
            onClick={() => deleteNode(hoveredNodeId)}
            style={{ position: 'fixed', top: trashPosition.top, left: trashPosition.left, zIndex: 1000, background: '#D83333', color: 'white', border: 'none', borderRadius: '50%', width: '26px', height: '26px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 5px rgba(0,0,0,0.3)', fontSize: '12px' }}
            title="Delete Node"
          >
            🗑️
          </button>
        )}

        {hoveredEdgeId && (
          <button
            onMouseEnter={() => setHoveredEdgeId(hoveredEdgeId)}
            onMouseLeave={() => setHoveredEdgeId(null)}
            onClick={() => deleteEdge(hoveredEdgeId)}
            style={{ position: 'fixed', top: trashPosition.top, left: trashPosition.left, zIndex: 1000, background: '#D83333', color: 'white', border: 'none', borderRadius: '50%', width: '26px', height: '26px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 5px rgba(0,0,0,0.3)', fontSize: '12px' }}
            title="Delete Connection"
          >
            🗑️
          </button>
        )}
      </div>

      {isModalOpen && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.7)', zIndex: 100, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          <div style={{ background: '#222', padding: '20px', borderRadius: '8px', width: '600px', maxWidth: '90%', border: '1px solid #444', display: 'flex', flexDirection: 'column', boxShadow: '0 10px 30px rgba(0,0,0,0.5)' }}>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
              <h3 style={{ margin: 0, color: '#E6E6E6' }}>Generated YAML</h3>
              <button 
                onClick={() => setIsModalOpen(false)} 
                style={{ background: 'transparent', border: 'none', color: '#888', cursor: 'pointer', fontSize: '18px' }}
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            
            <textarea 
              readOnly 
              value={currentYaml} 
              style={{ width: '100%', height: '350px', background: '#191919', color: '#A6E22E', border: '1px solid #333', padding: '15px', fontFamily: 'monospace', fontSize: '14px', borderRadius: '4px', resize: 'none', boxSizing: 'border-box' }}
            />
            
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '15px' }}>
              <button 
                onClick={handleCopy}
                style={{ background: '#333', color: '#FFF', border: '1px solid #555', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer', transition: 'background 0.2s' }}
                onMouseOver={(e) => e.target.style.background = '#444'}
                onMouseOut={(e) => e.target.style.background = '#333'}
              >
                {copyStatus}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .react-flow__node { background: #222222; color: #E6E6E6; border: 1px solid #333333; border-radius: 6px; padding: 10px; }
        .react-flow__edge-path { stroke: #555555; stroke-width: 2px; transition: stroke 0.15s; }
        .react-flow__edge:hover .react-flow__edge-path { stroke: #D83333; }
        .react-flow__controls button { background: #222222; fill: #E6E6E6; border-bottom: 1px solid #333333; }
        .react-flow__controls button:hover { background: #2A2A2A; }
        .react-flow__handle { background: #555555; }
      `}</style>
    </div>
  );
}

// Wrap inside ReactFlowProvider so screenToFlowPosition hook context is active
export default function WorkflowBuilder() {
  return (
    <ReactFlowProvider>
      <WorkflowCanvas />
    </ReactFlowProvider>
  );
}
