// src/lib/agents.ts
export interface AgentDefinition {
  id: string;
  name: string;
  display_name: string;
  description: string;
  status: "active" | "inactive";
  capabilities: readonly string[];
  role: string;
  model: string;
  human_approval: boolean;
}

export const AGENT_DEFINITIONS: AgentDefinition[] = [
  {
    id: "lead-intake",
    name: "lead-intake",
    display_name: "Lead Intake Agent",
    description: "Processes incoming leads from all channels and enriches contact data",
    status: "active",
    capabilities: ["Web form parsing", "Email extraction", "CRM deduplication", "Data enrichment"],
    role: "intake",
    model: "claude-sonnet-4-6",
    human_approval: false,
  },
  {
    id: "qualification",
    name: "qualification",
    display_name: "Qualification Agent",
    description: "Scores and qualifies leads using ICP criteria and conversation analysis",
    status: "active",
    capabilities: [
      "ICP scoring",
      "Budget detection",
      "Timeline analysis",
      "Decision maker identification",
    ],
    role: "qualification",
    model: "claude-sonnet-4-6",
    human_approval: false,
  },
  {
    id: "quotation",
    name: "quotation",
    display_name: "Quotation Agent",
    description: "Generates customized quotes based on client requirements and pricing rules",
    status: "active",
    capabilities: [
      "Pricing calculation",
      "Template selection",
      "Discount rules",
      "Proposal generation",
    ],
    role: "quotation",
    model: "claude-sonnet-4-6",
    human_approval: true,
  },
  {
    id: "orchestrator",
    name: "orchestrator",
    display_name: "Orchestrator Agent",
    description: "Coordinates between agents and manages the overall workflow pipeline",
    status: "active",
    capabilities: ["Workflow routing", "Agent coordination", "Error recovery", "Progress tracking"],
    role: "orchestrator",
    model: "claude-sonnet-4-6",
    human_approval: false,
  },
];

export const agentByName = (name: string): AgentDefinition | undefined =>
  AGENT_DEFINITIONS.find((a) => a.name === name);
