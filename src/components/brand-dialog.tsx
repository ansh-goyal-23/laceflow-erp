import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { store, type Brand } from "@/lib/store";
import { toast } from "sonner";

export function BrandDialog({
  open,
  onOpenChange,
  brand,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  brand?: Brand | null;
  onSaved?: (b: Brand) => void;
}) {
  const [name, setName] = useState("");

  useEffect(() => {
    if (open) setName(brand?.name ?? "");
  }, [open, brand]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const n = name.trim();
    if (!n) return;
    if (brand) {
      store.updateBrand(brand.id, n);
      toast.success("Brand updated");
      onOpenChange(false);
    } else {
      const b = store.addBrand(n);
      toast.success("Brand added");
      onSaved?.(b);
      onOpenChange(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{brand ? "Edit Brand" : "Add Brand"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="brand-name">Brand Name</Label>
            <Input id="brand-name" value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit">{brand ? "Update" : "Add"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}