import React from 'react';
import { ReactFlow } from '@xyflow/react';
import '@xyflow/react/dist/style.css';

const nodes = [
  { id: '1', position: { x: 0, y: 0 }, data: { label: 'Node 1' } },
  { id: '2', position: { x: 200, y: 0 }, data: { label: 'Node 2' } },
];

const edges = [{ id: 'e1-2', source: '1', target: '2' }];

export default function WorkflowBuilder() {
  return (
    <div style={{ width: '100%', height: '400px' }}>
      <ReactFlow nodes={nodes} edges={edges} fitView />
    </div>
  );
}
