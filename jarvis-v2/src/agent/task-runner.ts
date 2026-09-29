import { createTask, getTask, updateTask, JarvisTask } from './task-state.js';
import { executeTaskStepLoop, ProgressCallback } from './tool-loop.js';

export async function startTask(
  sessionId: string,
  goal: string,
  onProgress?: ProgressCallback
): Promise<JarvisTask> {
  const task = createTask(sessionId, goal);
  return await executeTaskStepLoop(task, sessionId, onProgress);
}

export async function resumeTaskWithSelection(
  taskId: string,
  selectedOption: any,
  sessionId: string,
  onProgress?: ProgressCallback
): Promise<JarvisTask> {
  const task = getTask(taskId);
  if (!task) {
    throw new Error(`Task ${taskId} not found`);
  }
  if (task.sessionId !== sessionId) {
    throw new Error(`Unauthorized session for task ${taskId}`);
  }

  // Bind selected option context
  let updatedPatientId = task.patientId;
  let updatedPatientName = task.patientName;

  if (selectedOption?.patientId) {
    updatedPatientId = selectedOption.patientId;
    updatedPatientName = selectedOption.name;
  }

  const updatedTask = updateTask(taskId, {
    status: 'running',
    patientId: updatedPatientId,
    patientName: updatedPatientName,
    needsSelection: null,
  });

  if (!updatedTask) {
    throw new Error(`Failed to update task ${taskId}`);
  }

  // Push UI Command for selected patient if available
  if (updatedPatientId) {
    updatedTask.uiCommands.push({
      type: 'OPEN_PATIENT',
      patientId: updatedPatientId,
      friendlyId: selectedOption.friendlyId || updatedPatientId,
    });
  }

  return await executeTaskStepLoop(updatedTask, sessionId, onProgress);
}
