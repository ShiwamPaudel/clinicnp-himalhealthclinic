"use client";

/**
 * invoice-photo.tsx — "Fill from a photo" on the purchase entry screen.
 *
 * It fills boxes. It does not record anything: the person still reads the
 * paper in their hand against what landed in the form, corrects whatever is
 * wrong, and presses Save themselves. The photo itself is read on the device
 * and dropped — it is never uploaded and never kept with the purchase (D-144).
 *
 * The reader is ~6 MB of model and runtime, so it is only fetched when
 * somebody actually picks a photo, never on the way into the page.
 */
import { useRef, useState } from "react";
import { Camera, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { buildDraft, type Draft, type DraftItem } from "@/lib/invoice-read/draft";
import { parseInvoiceText } from "@/lib/invoice-read/parse";
import { readPhotoText, type ReadStage } from "@/lib/invoice-read/ocr";

const STAGE_TEXT: Record<ReadStage, string> = {
  opening: "Opening the photo…",
  loading: "Getting the reader ready…",
  reading: "Reading the bill…",
};

export function InvoicePhotoButton({
  items,
  onDraft,
}: {
  items: DraftItem[];
  onDraft: (draft: Draft) => void;
}) {
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [stage, setStage] = useState<ReadStage | null>(null);

  async function onPick(file: File) {
    setStage("opening");
    try {
      const text = await readPhotoText(file, setStage);
      const read = parseInvoiceText(text);
      if (read.lines.length === 0) {
        toast.error(
          "Nothing could be read off that photo. Try a straighter, brighter one — or enter this bill by hand.",
        );
        return;
      }
      onDraft(buildDraft(read, items));
      toast.success(
        `Read ${read.lines.length} line${read.lines.length === 1 ? "" : "s"}. Check every one against the paper.`,
      );
    } catch (e) {
      // The person gets a sentence; whoever has to work out why gets the rest.
      console.error("Invoice reader:", e);
      toast.error("The photo could not be read. Check the connection and try again.");
    } finally {
      setStage(null);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          // Clear it first, so picking the same photo twice still fires.
          e.target.value = "";
          if (file) void onPick(file);
        }}
      />
      <Button
        variant="secondary"
        disabled={stage !== null}
        onClick={() => fileRef.current?.click()}
      >
        {stage ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
        {stage ? STAGE_TEXT[stage] : "Fill from a photo"}
      </Button>
      <p className="text-[12px] text-sage-500">
        {stage
          ? "This takes a few seconds. The first photo of the day takes longer."
          : "Take or pick a photo of the supplier's bill. It only fills the boxes below — check them against the paper before saving. The photo is not kept."}
      </p>
    </div>
  );
}
