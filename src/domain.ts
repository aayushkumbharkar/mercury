export type Verdict = 'SUCCESS' | 'FAILED' | 'INCONCLUSIVE';
export type Risk = 'AUTO' | 'APPROVAL' | 'BLOCKED';
export type App = 'Calendar' | 'Sheets' | 'Docs';
export interface Entity {
  id: string; app: App; title: string; value: string; version: string;
  externalId: string; url: string; dependsOn: string[]; owner: string; risk: Risk;
  latest?: string; locked?: boolean; offsetDays?: number;
}
export interface Action extends Entity { expected: string; reason: string }
export interface Plan { id: string; createdAt: string; targetDate: string; actions: Action[]; blockers: string[] }
export interface Observation { at: string; phase: string; value?: string; version?: string; error?: string }
export interface Result {
  id: string; verdict: Verdict; reason: string; recovered: boolean;
  attempts: { at: string; acknowledged: boolean; error?: string }[]; observations: Observation[];
}
export interface Receipt {
  id: string; planId: string; mode: 'live' | 'rehearsal'; startedAt: string; finishedAt?: string;
  verdict: Verdict; status: 'RUNNING' | 'FINISHED' | 'INTERRUPTED'; results: Result[];
  blockers: string[]; actions: Action[]; fault: string;
}
export interface Store {
  read(id: string): Promise<Entity>;
  mutate(action: Action, before: Entity): Promise<void>;
}
