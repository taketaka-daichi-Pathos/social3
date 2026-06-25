export type TaskProgressStatus = 'waiting' | 'in-progress' | 'completed' | 'error';

export interface OnboardingTask {
  id: string;
  email: string;
  progressStatus: TaskProgressStatus;
  progressLabel: string;
  taskDescription: string;
}
