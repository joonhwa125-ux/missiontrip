export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto flex w-full max-w-lg flex-col min-h-screen bg-app-bg">
      {children}
    </div>
  );
}
