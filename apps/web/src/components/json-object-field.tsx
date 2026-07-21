import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

type JsonObjectFieldProps = {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  minHeight?: string;
};

export function JsonObjectField({
  id,
  label,
  value,
  onChange,
  minHeight = 'min-h-28',
}: JsonObjectFieldProps) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Textarea
        id={id}
        className={`${minHeight} font-mono text-xs`}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}
