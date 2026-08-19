import { Informer, Layout, LayoutVariant } from 'fe-ui-kit';

export const App = () => {
  return (
    <Layout
      onClose={() => console.log('close')}
      variant={LayoutVariant.eService}
      headerTitle="Projects"
      className="bg-surface-grey_10 w-full h-full"
      contentClassName="!mx-auto !my-0 py-20"
    >
      <div className="flex flex-1 w-full">
        <Informer className="w-full" title="Informer Title asdasdasd" />
      </div>
    </Layout>
  );
};
