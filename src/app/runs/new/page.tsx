"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export default function NewRunPage() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleUpload() {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/runs", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "upload failed");
      router.push(`/runs/${data.run.id}/analysis`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl px-6 py-8">
      <Card>
        <CardHeader>
          <CardTitle>Upload a lead file</CardTitle>
          <CardDescription>
            Runs stage 1.1 (pandas anomaly analysis) automatically. You&apos;ll review the results and approve
            sanitization before anything else happens.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="file">Lead CSV</Label>
            <Input id="file" type="file" accept=".csv" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </div>
          {error && (
            <Alert variant="destructive">
              <AlertTitle>Upload failed</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <Button disabled={!file || busy} onClick={handleUpload}>
            {busy ? "Analyzing..." : "Upload & Analyze"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
