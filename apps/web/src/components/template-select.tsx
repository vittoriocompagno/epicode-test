import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { TemplateResponse } from '@certificates/contracts';

type TemplateSelectProps = {
  id: string;
  label?: string;
  value: string;
  onValueChange: (value: string) => void;
  templates: TemplateResponse[];
  placeholder?: string;
  className?: string;
};

export function TemplateSelect({
  id,
  label = 'Template',
  value,
  onValueChange,
  templates,
  placeholder = 'Select template',
  className,
}: TemplateSelectProps) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger id={id} className={className ?? 'w-full'}>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {templates.map((template) => (
            <SelectItem key={template.id} value={template.id}>
              {template.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
