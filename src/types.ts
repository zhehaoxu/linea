export type NodeType =
  | 'switch'
  | 'clock'
  | 'lamp'
  | 'display'
  | 'dff'
  | 'text'
  | 'and'
  | 'or'
  | 'not'
  | 'xor'
  | 'nand'
  | 'nor'
  | 'xnor'

export type BasicNodeType = Exclude<NodeType, 'text'>

export type Tool = 'select' | 'pan'

export type Bit = 0 | 1

export interface Vec {
  x: number
  y: number
}

export interface CircuitNode {
  id: string
  type: NodeType
  x: number
  y: number
  value: Bit
  freq?: number
  text?: string
}

export interface WireEnd {
  nodeId: string
  port: string
}

export interface Wire {
  id: string
  from: WireEnd
  to: WireEnd
}

export interface CircuitGroup {
  id: string
  nodes: string[]
}

export interface Selection {
  nodes: string[]
  wires: string[]
}

export interface ViewState {
  x: number
  y: number
  zoom: number
}
