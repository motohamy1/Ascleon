import Welcome from "@/components/welcome/Welcome";

const HomePage = async () => {
  return (
    <main className="mx-auto w-full max-w-[1840px] 2xl:max-w-[2160px] min-h-[calc(100vh-120px)] px-3.5 pt-[94px] pb-16 sm:px-6 md:px-8 lg:px-10 xl:px-12 sm:pt-[102px] acid-bg transition-all">
      <Welcome />
    </main>
  );
};

export default HomePage;
