function doGet() {
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('ぴったり1')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
