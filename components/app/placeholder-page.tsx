import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type PlaceholderPageProps = {
  title: string;
  description: string;
};

export function PlaceholderPage({ title, description }: PlaceholderPageProps) {
  return (
    <div className="space-y-5 sm:space-y-6">
      <div className="space-y-2">
        <Badge variant="secondary" className="w-fit">
          Em breve
        </Badge>
        <h1 className="text-2xl font-semibold text-neutral-950 sm:text-3xl">{title}</h1>
        <p className="max-w-2xl text-sm leading-6 text-neutral-600">{description}</p>
      </div>

      <Card>
        <CardHeader className="p-4 sm:p-6">
          <CardTitle>Base preparada</CardTitle>
          <CardDescription>
            Esta área já está conectada ao layout principal e pronta para receber a lógica real.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
          <div className="grid gap-3 sm:grid-cols-3">
            {["Dados reais", "Filtros", "Ações"].map((item) => (
              <div className="rounded-md border bg-neutral-50 p-4 text-sm text-neutral-600" key={item}>
                {item}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
