window.DocumentPages = {
  count(file) {
    return new Promise(async (resolve, reject) => {
      let worker, timer;
      const finish = (error, pages) => { clearTimeout(timer); worker?.terminate(); error ? reject(error) : resolve(pages); };
      try {
        worker = new Worker('/document-pages-worker.js');
        timer = setTimeout(() => finish(Error('Page counting took too long. Export a simpler PDF and try again.')), 20000);
        worker.onmessage = ({ data }) => finish(data.error ? Error(data.error) : null, data.pages);
        worker.onerror = () => finish(Error('Page counting could not start. Refresh the app and try again.'));
        const bytes = await file.arrayBuffer();
        worker.postMessage({ name: file.name, bytes }, [bytes]);
      } catch { finish(Error('Could not read this file. Please select it again.')); }
    });
  }
};
