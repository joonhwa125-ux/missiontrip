export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-lg min-h-screen bg-app-bg">
      {children}
    </div>
  );
}
