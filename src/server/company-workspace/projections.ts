import type {
  ActivityProjection,
  CommercialProjection,
  CoreProjection,
  DeliveryFinanceProjection,
  OverviewProjection,
  StakeholdersProjection,
} from "@/lib/company-workspace/types";

export function createCoreProjection(input: CoreProjection): CoreProjection {
  return input;
}

export function createOverviewProjection(input: OverviewProjection): OverviewProjection {
  return input;
}

export function createStakeholdersProjection(
  input: StakeholdersProjection,
): StakeholdersProjection {
  return input;
}

export function createActivityProjection(input: ActivityProjection): ActivityProjection {
  return input;
}

export function createCommercialProjection(input: CommercialProjection): CommercialProjection {
  return input;
}

export function createDeliveryFinanceProjection(
  input: DeliveryFinanceProjection,
): DeliveryFinanceProjection {
  return input;
}
