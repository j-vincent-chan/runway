export const EMPLOYEE_DRAG_MIME = "application/x-employee-id";

export function setDragEmployee(dataTransfer: DataTransfer, employeeId: string) {
  dataTransfer.setData(EMPLOYEE_DRAG_MIME, employeeId);
  dataTransfer.effectAllowed = "move";
}

export function getDragEmployee(dataTransfer: DataTransfer): string | null {
  const id = dataTransfer.getData(EMPLOYEE_DRAG_MIME);
  return id || null;
}
