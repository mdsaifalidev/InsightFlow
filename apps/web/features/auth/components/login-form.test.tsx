import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { apiFetch } from "@/lib/api-client"

import { LoginForm } from "./login-form"

const replace = vi.fn()
let searchParams = new URLSearchParams()

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: vi.fn() }),
  useSearchParams: () => searchParams,
}))

function renderForm() {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <LoginForm />
    </QueryClientProvider>
  )
}

describe("LoginForm", () => {
  beforeEach(() => {
    replace.mockReset()
    searchParams = new URLSearchParams()
  })

  it("validates fields before calling the API", async () => {
    renderForm()
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }))

    expect(
      await screen.findByText("Enter a valid email address.")
    ).toBeInTheDocument()
    expect(screen.getByText("Enter your password.")).toBeInTheDocument()
    expect(replace).not.toHaveBeenCalled()
  })

  it("shows the server error for wrong credentials", async () => {
    renderForm()
    await userEvent.type(screen.getByLabelText("Email"), "nobody@example.com")
    await userEvent.type(screen.getByLabelText("Password"), "whatever-123")
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }))

    expect(
      await screen.findByText("Email or password is incorrect.")
    ).toBeInTheDocument()
  })

  it("signs in and follows a safe ?next path", async () => {
    await apiFetch("/api/auth/register", {
      method: "POST",
      body: {
        name: "Arif",
        email: "arif@example.com",
        password: "long-enough",
      },
    })
    searchParams = new URLSearchParams({ next: "/app/settings" })

    renderForm()
    await userEvent.type(screen.getByLabelText("Email"), "arif@example.com")
    await userEvent.type(screen.getByLabelText("Password"), "long-enough")
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }))

    await vi.waitFor(() =>
      expect(replace).toHaveBeenCalledWith("/app/settings")
    )
  })

  it("ignores an off-site ?next redirect", async () => {
    await apiFetch("/api/auth/register", {
      method: "POST",
      body: {
        name: "Arif",
        email: "arif@example.com",
        password: "long-enough",
      },
    })
    searchParams = new URLSearchParams({ next: "https://evil.example" })

    renderForm()
    await userEvent.type(screen.getByLabelText("Email"), "arif@example.com")
    await userEvent.type(screen.getByLabelText("Password"), "long-enough")
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }))

    await vi.waitFor(() =>
      expect(replace).toHaveBeenCalledWith("/app/datasets")
    )
  })
})
