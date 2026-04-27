import { getMigrations } from "better-auth/db/migration"
import { auth } from "./auth"
import { err, l } from "./helpers/log"

async function seed() {
  // Run migrations first — creates all tables if they don't exist
  const { runMigrations } = await getMigrations(auth.options)
  await runMigrations()
  l("✅ Database migrated")

  try {
    const user = await auth.api.signUpEmail({
      body: {
        email: "alice@demo.bank",
        password: "password123",
        name: "Alice Demo",
      },
    })
    l("✅ Seeded user:", user.user.email)
  } catch (e: any) {
    if (e?.message?.includes("already exists") || e?.status === 422) {
      l("ℹ️  User alice@demo.bank already exists, skipping seed.")
    } else {
      err("❌ Seed failed:", e)
    }
  }
}

seed()
