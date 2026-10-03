import { File as NodeFile } from "node:buffer"

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { fireEvent, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { apiFetch } from "@/lib/api-client"
import type { AuthResponse } from "@/lib/api/types"
import { setAccessToken } from "@/lib/auth-token"
import { uploadFile } from "@/lib/upload"
import { createUploadDataset } from "@/mocks/handlers/datasets"

import { stopAllJobs } from "../job-tracker"
import { UploadDialog } from "./upload-dialog"

// jsdom's File/FormData can't go through MSW's multipart parsing (a Vitest
// jsdom-environment limitation), so the upload request itself is stubbed and
// the mock backend is called in-process. The HTTP contract is covered in
// mocks/handlers/datasets.test.ts and the XHR path by Playwright. Processing
// progress still streams over real (mocked) SSE.
vi.mock("@/lib/upload", () => ({ uploadFile: vi.fn() }))

/** jsdom 27 Blobs lack arrayBuffer(); FileReader works. */
function readBytes(blob: Blob) {
  return new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as ArrayBuffer)
    reader.onerror = () => reject(reader.error)
    reader.readAsArrayBuffer(blob)
  })
}

function renderDialog() {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <UploadDialog open onOpenChange={() => {}} />
    </QueryClientProvider>
  )
}

function fileInput() {
  return document.querySelector<HTMLInputElement>('input[type="file"]')!
}

describe("UploadDialog", () => {
  beforeEach(async () => {
    stopAllJobs()
    const res = await apiFetch<AuthResponse>("/api/auth/register", {
      method: "POST",
      body: {
        name: "Maya",
        email: "maya@example.com",
        password: "long-enough",
      },
    })
    setAccessToken(res.accessToken)
    vi.mocked(uploadFile).mockImplementation(async (_path, body) => {
      const file = body.get("file") as File
      const native = new NodeFile(
        [new Uint8Array(await readBytes(file))],
        file.name
      ) as unknown as File
      return createUploadDataset(
        res.workspace.id,
        native,
        String(body.get("name") ?? "")
      )
    })
  })

  it("rejects unsupported file types before uploading", async () => {
    renderDialog()
    fireEvent.change(fileInput(), {
      target: {
        files: [new File(["%PDF"], "report.pdf", { type: "application/pdf" })],
      },
    })

    expect(
      await screen.findByText("Choose a .csv or .xlsx file.")
    ).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Upload" })).toBeDisabled()
    expect(uploadFile).not.toHaveBeenCalled()
  })

  it("uploads a CSV and follows processing through to ready", async () => {
    renderDialog()
    fireEvent.change(fileInput(), {
      target: {
        files: [
          new File(
            ["day,region,sales\n2025-01-01,EU,10\n2025-01-02,US,12\n"],
            "sales_q1.csv"
          ),
        ],
      },
    })

    const name = await screen.findByLabelText("Dataset name")
    expect(name).toHaveValue("sales_q1")
    await userEvent.clear(name)
    await userEvent.type(name, "Q1 sales")
    await userEvent.click(screen.getByRole("button", { name: "Upload" }))

    expect(
      await screen.findByRole("heading", { name: "Q1 sales" })
    ).toBeInTheDocument()
    expect(screen.getByText("Profiling columns")).toBeInTheDocument()
    expect(
      await screen.findByRole(
        "link",
        { name: "Open dashboard" },
        { timeout: 4000 }
      )
    ).toHaveAttribute(
      "href",
      expect.stringMatching(/^\/app\/datasets\/[\w-]+$/)
    )
  })
})
