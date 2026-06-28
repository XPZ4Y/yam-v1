import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { 
  ReactFlow, Background, Controls, addEdge, applyNodeChanges, 
  applyEdgeChanges, useReactFlow, ReactFlowProvider, Handle, Position 
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

const nodeTypesList = [
  // Common Blocks
  { type: 'supernode', label: 'Super Node', category: 'Common', color: '#10b981' },
  { type: 'execute-branch', label: 'Execute Workflow on Branch', category: 'Common', color: '#f59e0b' },
  { type: 'container-setup', label: 'Container Setup (Job)', category: 'Common', color: '#3b82f6' },
  { type: 'echo', label: 'Echo', category: 'Common', color: '#10b981' },
  { type: 'checkout', label: 'Checkout Code', category: 'Common', color: '#f59e0b' },
  { type: 'setup-go', label: 'Setup Go', category: 'Common', color: '#3b82f6' },
  { type: 'run-script', label: 'Run Script', category: 'Common', color: '#10b981' },
  { type: 'upload-artifact', label: 'Upload Artifact', category: 'Common', color: '#ec4899' },
  { type: 'download-artifact', label: 'Download Artifact', category: 'Common', color: '#ec4899' },
  { type: 'github-release', label: 'GitHub Release', category: 'Common', color: '#ec4899' },
  
  // Pro: Void Build Blocks
  { type: 'void-prep', label: 'Void: Prepare Container', category: 'Pro: Void Build Blocks', color: '#3b82f6' },
  { type: 'checkout-treeless', label: 'Treeless Checkout', category: 'Pro: Void Build Blocks', color: '#f59e0b' },
  { type: 'void-masterdir', label: 'Void: Prepare Masterdir', category: 'Pro: Void Build Blocks', color: '#10b981' },
  { type: 'xbps-build', label: 'Void: Build Package', category: 'Pro: Void Build Blocks', color: '#10b981' },
  { type: 'find-xbps', label: 'Void: Find XBPS Package', category: 'Pro: Void Build Blocks', color: '#ec4899' },
  { type: 'lfs-upload', label: 'Git LFS Upload', category: 'Pro: Void Build Blocks', color: '#f59e0b' }
];

const bounds = [[-2000, -2000], [2000, 2000]];

const CustomNode = ({ id, data }) => {
  const { updateNodeData } = useReactFlow();
  const borderColor = data.color || '#444';

  return (
    <div style={{ background: '#222', border: `1px solid #444`, borderTop: `4px solid ${borderColor}`, borderRadius: '6px', padding: '10px', minWidth: '220px', maxWidth: '350px', color: '#E6E6E6', position: 'relative' }}>
      <Handle type="target" position={Position.Top} style={{ background: '#555' }} />
      
      <div style={{ fontWeight: 'bold', marginBottom: '8px', fontSize: '12px', borderBottom: '1px solid #333', paddingBottom: '4px' }}>
        {data.label}
      </div>
      
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {Object.entries(data).map(([key, val]) => {
          if (['label', 'color'].includes(key)) return null;
          return (
            <div key={key} style={{ display: 'flex', flexDirection: 'column' }}>
              <label style={{ fontSize: '10px', color: '#AAA', marginBottom: '2px' }}>{key}</label>
              {(key === 'run' || key === 'commands') ? (
                <textarea 
                  className="nodrag"
                  value={val}
                  onChange={(e) => updateNodeData(id, { [key]: e.target.value })}
                  style={{ background: '#111', border: '1px solid #444', color: '#FFF', padding: '6px', borderRadius: '4px', fontSize: '10px', minHeight: '60px', fontFamily: 'monospace', resize: 'vertical' }}
                />
              ) : (
                <input 
                  className="nodrag"
                  value={val}
                  onChange={(e) => updateNodeData(id, { [key]: e.target.value })}
                  style={{ background: '#111', border: '1px solid #444', color: '#FFF', padding: '4px', borderRadius: '4px', fontSize: '10px', fontFamily: 'monospace' }}
                />
              )}
            </div>
          );
        })}
      </div>
      <Handle type="source" position={Position.Bottom} style={{ background: '#555' }} />
    </div>
  );
};

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

  let containerBlock = '';
  const containerNode = nodes.find(n => n.type === 'container-setup');
  if (containerNode && containerNode.data.image) {
    containerBlock = `    container:\n      image: ${containerNode.data.image}\n      options: --privileged\n      volumes:\n        - /dev:/dev\n\n`;
  }

  let yaml = `name: Visual Workflow\n\non:\n  push:\n    branches: [master]\n  workflow_dispatch:\n\njobs:\n  build:\n    runs-on: ubuntu-latest\n${containerBlock}    steps:\n`;
  
  order.forEach(id => {
    const node = nodes.find(n => n.id === id);
    if (!node) return;
    if (node.type === 'container-setup') return;

    // Use custom node_name if provided by a Supernode, else fall back to label/id
    const stepName = node.data.node_name || node.data.label || node.id;
    yaml += `      - name: "${stepName}"\n`;
    
    if (node.data.id) yaml += `        id: ${node.data.id}\n`;
    
    let isUses = false;
    let isRun = false;

    if (node.data.uses) {
      yaml += `        uses: ${node.data.uses}\n`;
      isUses = true;
    } else if (node.data.run || node.data.commands) {
      const scriptContent = node.data.run || node.data.commands;
      if (scriptContent.includes('\n')) {
        yaml += `        run: |\n`;
        scriptContent.split('\n').forEach(line => {
          yaml += `          ${line}\n`;
        });
      } else {
        yaml += `        run: ${scriptContent}\n`;
      }
      isRun = true;
    } else if (node.type === 'echo') {
      yaml += `        run: echo "${node.data.message || ''}"\n`;
      isRun = true;
    } else {
      yaml += `        run: echo "Executing abstract node ${node.type}"\n`;
      isRun = true;
    }

    let hasExtraParams = false;
    let paramBlock = '';
    
    for (const [key, value] of Object.entries(node.data)) {
      // Exclude structural/UI keys from the output
      if (['label', 'uses', 'run', 'commands', 'message', 'id', 'color', 'node_name'].includes(key)) continue;
      paramBlock += `          ${key}: ${value === '' ? '""' : value}\n`;
      hasExtraParams = true;
    }

    if (hasExtraParams) {
      if (isUses) {
        yaml += `        with:\n${paramBlock}`;
      } else if (isRun) {
        yaml += `        env:\n${paramBlock}`;
      }
    }
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
  const [currentYaml, setCurrentYaml] = useState(() => typeof window !== 'undefined' ? localStorage.getItem('yamal_current_yaml') || '' : '');
  
  const [repoUrl, setRepoUrl] = useState(() => typeof window !== 'undefined' ? localStorage.getItem('yamal_repo') || '' : '');
  const [pat, setPat] = useState(() => typeof window !== 'undefined' ? localStorage.getItem('yamal_pat') || '' : '');
  
  const [copyStatus, setCopyStatus] = useState('Copy to Clipboard');
  const [pushStatus, setPushStatus] = useState('Push to GitHub');

  // Accordion State
  const [openCategories, setOpenCategories] = useState({ 'Common': true, 'Pro: Void Build Blocks': false });

  // Node Hover State
  const [hoveredNodeId, setHoveredNodeId] = useState(null);
  const [hoveredEdgeId, setHoveredEdgeId] = useState(null);
  const [trashPosition, setTrashPosition] = useState({ top: 0, left: 0 });

  const { screenToFlowPosition, fitView } = useReactFlow();

  const nodeTypes = useMemo(() => {
    return nodeTypesList.reduce((acc, nt) => {
      acc[nt.type] = CustomNode;
      return acc;
    }, {});
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('yamal_nodes', JSON.stringify(nodes));
      localStorage.setItem('yamal_edges', JSON.stringify(edges));
      localStorage.setItem('yamal_repo', repoUrl);
      localStorage.setItem('yamal_pat', pat);
      const newYaml = generateYamlLocally(nodes, edges);
      localStorage.setItem('yamal_current_yaml', newYaml);
      setCurrentYaml(newYaml);
    }
  }, [nodes, edges, repoUrl, pat]);

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

    const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });
    const nodeDef = nodeTypesList.find(n => n.type === type);
    
    const newNode = {
      id: `${type}_${Date.now()}`,
      type,
      position,
      data: { 
        label: nodeDef?.label,
        color: nodeDef?.color, // Pass color down for rendering
        
        ...(type === 'supernode' && { node_name: 'Custom Super Step', commands: 'echo "I am a super node"' }),
        ...(type === 'execute-branch' && { branch_name: 'master' }),
        ...(type === 'container-setup' && { image: 'ghcr.io/void-linux/void-musl-full' }),
        ...(type === 'echo' && { message: '' }),
        ...(type === 'checkout' && { uses: 'actions/checkout@v4' }),
        ...(type === 'setup-go' && { uses: 'actions/setup-go@v5', 'go-version': '1.21' }),
        ...(type === 'run-script' && { run: 'echo "hello world"' }),
        ...(type === 'upload-artifact' && { uses: 'actions/upload-artifact@v4', name: 'artifact-name', path: './path' }),
        ...(type === 'download-artifact' && { uses: 'actions/download-artifact@v4', name: 'artifact-name', path: './path' }),
        ...(type === 'github-release' && { uses: 'softprops/action-gh-release@v2', files: 'hello.txt' }),
        
        ...(type === 'void-prep' && { run: "mkdir -p /etc/xbps.d && cp /usr/share/xbps.d/*-repository-*.conf /etc/xbps.d/\nsed -i 's|repo-default|repo-ci|g' /etc/xbps.d/*-repository-*.conf\nxbps-install -Syu xbps && xbps-install -yu && xbps-install -y sudo bash curl git git-lfs\nuseradd -G xbuilder -M builder" }),
        ...(type === 'checkout-treeless' && { uses: 'classabbyamp/treeless-checkout-action@v1' }),
        ...(type === 'void-masterdir' && { run: "chown -R builder:builder .\nsudo -Eu builder common/travis/set_mirror.sh\nsudo -Eu builder common/travis/prepare.sh\ncommon/travis/fetch-xtools.sh" }),
        ...(type === 'xbps-build' && { run: "sudo -Eu builder ./xbps-src pkg LibreCAD" }),
        ...(type === 'find-xbps' && { id: "verify_xbps", run: "XBPS_FILE=$(find hostdir/binpkgs -name \"LibreCAD-*.xbps\" | head -n 1)\nif [ -z \"$XBPS_FILE\" ]; then\n  echo \"No LibreCAD xbps package found!\"\n  exit 1\nfi\necho \"xbps_path=$XBPS_FILE\" >> $GITHUB_OUTPUT\necho \"Found XBPS package at: $XBPS_FILE\"" }),
        ...(type === 'lfs-upload' && { 
          run: "git clone https://x-access-token:${{ secrets.PERSONAL_PAT}}@github.com/kpnc0/void-packages-binaries.git binary-repo\ngit lfs install\ngit lfs track \"*.xbps\"\ncd binary-repo\nmkdir -p packages\ncp ../${{ steps.verify_xbps.outputs.xbps_path }} packages/\ngit config user.email \"bot@voidlinux.org\"\ngit config user.name \"Void Bot\"\ngit add -f packages/*.xbps\ngit commit -m \"Add LibreCAD package from ${{ github.sha }}\"\ngit push -f origin master", 
          PERSONAL_PAT: "${{ secrets.PERSONAL_PAT}}" 
        })
      },
    };
    setNodes((nds) => nds.concat(newNode));
  }, [screenToFlowPosition]);

  const loadHelloWorldTemplate = () => {
    const tNodes = [
      { id: 't_checkout', type: 'checkout', position: { x: 250, y: 100 }, data: { label: 'Checkout Code', color: '#f59e0b', uses: 'actions/checkout@v4' } },
      { id: 't_script', type: 'run-script', position: { x: 250, y: 250 }, data: { label: 'Run Script', color: '#10b981', run: 'echo "hello world" > hello.txt' } },
      { id: 't_release', type: 'github-release', position: { x: 250, y: 400 }, data: { label: 'GitHub Release', color: '#ec4899', uses: 'softprops/action-gh-release@v2', files: 'hello.txt' } }
    ];
    const tEdges = [
      { id: 'te_1', source: 't_checkout', target: 't_script' },
      { id: 'te_2', source: 't_script', target: 't_release' }
    ];
    setNodes(tNodes);
    setEdges(tEdges);
    setTimeout(() => fitView({ duration: 500 }), 100);
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(currentYaml);
    setCopyStatus('Copied!');
    setTimeout(() => setCopyStatus('Copy to Clipboard'), 2000);
  };

  const handleGithubPush = async () => {
    if (!repoUrl || !pat) {
      alert('Provide Repository Link and PAT.');
      return;
    }
    if (nodes.length === 0) {
      alert('Cannot push empty workflow.');
      return;
    }
    let filename = prompt('Enter workflow file name (e.g., build.yaml):', 'workflow.yaml');
    if (!filename) return;
    if (!filename.endsWith('.yaml') && !filename.endsWith('.yml')) filename += '.yaml';

    let owner, repo;
    try {
      const cleanUrl = repoUrl.replace('https://github.com/', '').replace('.git', '');
      [owner, repo] = cleanUrl.split('/').filter(Boolean);
      if (!owner || !repo) throw new Error();
    } catch (e) {
      alert('Invalid repository format.');
      return;
    }

    setPushStatus('Pushing...');
    try {
      const path = `.github/workflows/${filename}`;
      const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
      const headers = { 'Authorization': `Bearer ${pat}`, 'Accept': 'application/vnd.github.v3+json', 'Content-Type': 'application/json' };

      let sha;
      const getRes = await fetch(apiUrl, { headers });
      if (getRes.ok) {
        const getData = await getRes.json();
        sha = getData.sha;
      }
      const contentEncoded = btoa(unescape(encodeURIComponent(currentYaml)));
      const putRes = await fetch(apiUrl, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ message: `Update ${filename} via Yamal Workflow Builder`, content: contentEncoded, sha })
      });

      if (!putRes.ok) throw new Error((await putRes.json()).message || 'Push failed');
      setPushStatus('Success!');
      setTimeout(() => setPushStatus('Push to GitHub'), 2000);
    } catch (err) {
      alert(`Error: ${err.message}`);
      setPushStatus('Push to GitHub');
    }
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

  // Center-Right Trash Button Math
  const handleNodeMouseEnter = (event, node) => {
    const rect = event.target.getBoundingClientRect();
    setHoveredNodeId(node.id);
    setTrashPosition({ 
      top: rect.top + window.scrollY + (rect.height / 2) - 13, // Vertically centered
      left: rect.right + window.scrollX - 10                   // Snapped to the right edge
    });
  };

  const handleEdgeMouseEnter = (event, edge) => {
    setHoveredEdgeId(edge.id);
    setTrashPosition({ top: event.clientY - 15, left: event.clientX - 15 });
  };

  const toggleCategory = (category) => {
    setOpenCategories(prev => ({ ...prev, [category]: !prev[category] }));
  };

  return (
    <div className="dark-theme-wrapper" style={{ display: 'flex', width: '100vw', height: '100vh', backgroundColor: '#191919' }}>
      
      <aside className="sidebar" style={{ display: 'flex', flexDirection: 'column', width: '280px', background: '#222', padding: '20px', borderRight: '1px solid #333', color: '#E6E6E6', zIndex: 10, overflowY: 'auto' }}>
        <h3 style={{ marginTop: 0 }}>Nodes</h3>
        
        <div style={{ flexGrow: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {['Common', 'Pro: Void Build Blocks'].map(category => (
            <div key={category} style={{ marginBottom: '8px' }}>
              <div 
                onClick={() => toggleCategory(category)}
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', background: '#2A2A2A', padding: '8px 10px', borderRadius: '4px', border: '1px solid #444' }}
              >
                <h4 style={{ color: '#E6E6E6', margin: 0, fontSize: '12px', textTransform: 'uppercase', letterSpacing: '1px' }}>{category}</h4>
                <span style={{ fontSize: '10px', color: '#888' }}>{openCategories[category] ? '▼' : '▶'}</span>
              </div>
              
              {openCategories[category] && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px', paddingLeft: '5px' }}>
                  {nodeTypesList.filter(n => n.category === category).map((n) => (
                    <div
                      key={n.type}
                      onDragStart={(e) => onDragStart(e, n.type)}
                      draggable
                      style={{ background: '#222', padding: '10px', borderRadius: '4px', cursor: 'grab', border: '1px solid #444', borderLeft: `4px solid ${n.color}`, fontSize: '12px' }}
                    >
                      {n.label}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        <div style={{ marginTop: '15px', display: 'flex', flexDirection: 'column', gap: '8px', borderTop: '1px solid #444', paddingTop: '15px' }}>
          <h4 style={{ margin: '0 0 5px 0', fontSize: '12px', color: '#AAA' }}>GitHub Deploy</h4>
          <input 
            placeholder="owner/repo or URL" 
            value={repoUrl}
            onChange={e => setRepoUrl(e.target.value)}
            style={{ background: '#111', border: '1px solid #444', color: '#FFF', padding: '8px', borderRadius: '4px', fontSize: '12px' }}
          />
          <input 
            type="password"
            placeholder="Personal Access Token" 
            value={pat}
            onChange={e => setPat(e.target.value)}
            style={{ background: '#111', border: '1px solid #444', color: '#FFF', padding: '8px', borderRadius: '4px', fontSize: '12px' }}
          />
          <button 
            onClick={handleGithubPush}
            style={{ width: '100%', padding: '10px', background: '#238636', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '12px', transition: 'background 0.2s' }}
          >
            {pushStatus}
          </button>
        </div>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '20px' }}>
          <button 
            onClick={loadHelloWorldTemplate} 
            style={{ width: '100%', padding: '10px', background: '#30363D', color: '#58A6FF', border: '1px solid #58A6FF', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '12px' }}
          >
            Load Hello World Template
          </button>
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
          nodeTypes={nodeTypes}
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
            style={{ position: 'fixed', top: trashPosition.top, left: trashPosition.left, zIndex: 1000, background: '#D83333', color: 'white', border: 'none', borderRadius: '50%', width: '26px', height: '26px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 6px rgba(0,0,0,0.4)', fontSize: '12px', transition: 'transform 0.1s' }}
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
            style={{ position: 'fixed', top: trashPosition.top, left: trashPosition.left, zIndex: 1000, background: '#D83333', color: 'white', border: 'none', borderRadius: '50%', width: '26px', height: '26px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 6px rgba(0,0,0,0.4)', fontSize: '12px' }}
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
                style={{ background: '#333', color: '#FFF', border: '1px solid #555', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer' }}
              >
                {copyStatus}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function WorkflowBuilder() {
  return (
    <ReactFlowProvider>
      <WorkflowCanvas />
    </ReactFlowProvider>
  );
}
