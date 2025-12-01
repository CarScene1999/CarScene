// Utility to check if a user is an admin
export function isAdmin(email: string | undefined): boolean {
  if (!email) return false;
  
  const adminEmails = process.env.ADMIN_EMAILS || '';
  const adminList = adminEmails.split(',').map(e => e.trim().toLowerCase());
  
  return adminList.includes(email.toLowerCase());
}
