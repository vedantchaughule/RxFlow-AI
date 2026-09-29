import { Toaster, toast } from 'react-hot-toast';

export const notify = { success: (message: string) => toast.success(message), error: (message: string) => toast.error(message) };
export function ToastNotifications() { return <Toaster position="top-right" toastOptions={{ className: 'app-toast', duration: 4_000 }}/>; }
