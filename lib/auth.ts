import { cookies } from "next/headers"

export async function isAdminAuthenticated() {
  const cookieStore = await cookies()
  const auth = cookieStore.get("admin_auth")

  return auth?.value === "true"
}