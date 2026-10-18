import { Card, CardAction, CardContent, CardDescription, CardHeader } from '@/components/ui/card';
import { cn } from 'cn';
import { CardLabel } from './CardLabel';

export interface ChartCardProps extends Omit<React.ComponentProps<'div'>, 'title'> {
  title: string;
  description?: React.ReactNode;
  /** Right side of the header: a toggle, a badge … */
  action?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}

/** A card holding one chart (or its empty state). */
export function ChartCard({ title, description, action, className, children, ...props }: ChartCardProps) {
  return (
    <Card className={cn('min-w-0', className)} data-slot="chart-card" {...props}>
      <CardHeader>
        <CardLabel>{title}</CardLabel>
        {description && <CardDescription className="text-xs">{description}</CardDescription>}
        {action && <CardAction>{action}</CardAction>}
      </CardHeader>
      <CardContent className="min-w-0">{children}</CardContent>
    </Card>
  );
}
