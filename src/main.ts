import * as cors_proxy from "cors-anywhere";
import { App, Modal, Notice, Plugin } from "obsidian";
import ReactDOM from "react-dom";
import { getAccessToken, Username as PocketUsername } from "./PocketAPI";
import {
  loadPocketAccessInfo,
  OBSIDIAN_AUTH_PROTOCOL_ACTION,
  storePocketAccessInfo,
} from "./PocketAuth";
import {
  PocketItemListView,
  POCKET_ITEM_LIST_VIEW_TYPE,
} from "./PocketItemListView";
import {
  closePocketItemStore,
  openPocketItemStore,
  PocketItemStore,
} from "./PocketItemStore";
import { createReactApp } from "./ReactApp";
import { PocketSettingTab } from "./Settings";
import { ViewManager } from "./ViewManager";

const setupCORSProxy = () => {
  // TODO: This code does not handle the setting where the CORS proxy has
  // already been set up.

  const host = "0.0.0.0";
  const port = 9090;
  cors_proxy.createServer({}).listen(port, host, () => {
    console.log("Running CORS Anywhere on " + host + ":" + port);
  });
};

export default class PocketSync extends Plugin {
  itemStore: PocketItemStore;
  appEl: HTMLDivElement;
  viewManager: ViewManager;
  pocketUsername: PocketUsername | null;
  pocketAuthenticated: boolean;

  async onload() {
    console.log("loading plugin");

    // Set up CORS proxy for Pocket API calls
    console.log("setting up CORS proxy");
    setupCORSProxy();

    // Set up Pocket item store
    console.log("opening Pocket item store");
    this.itemStore = await openPocketItemStore();

    this.addCommands();
    this.addSettingTab(new PocketSettingTab(this.app, this));

    const accessInfo = await loadPocketAccessInfo(this);
    if (!accessInfo) {
      console.log(`Not authenticated to Pocket`);
    }

    this.registerObsidianProtocolHandler(
      OBSIDIAN_AUTH_PROTOCOL_ACTION,
      async (params) => {
        const accessInfo = await getAccessToken();
        storePocketAccessInfo(this, accessInfo);
        this.pocketAuthenticated = true;
        this.pocketUsername = accessInfo.username;
      }
    );

    this.pocketAuthenticated = !!accessInfo;
    this.pocketUsername = accessInfo?.username;

    // Set up React-based Pocket item list view
    this.viewManager = new ViewManager();
    this.mount();
    this.registerView(
      POCKET_ITEM_LIST_VIEW_TYPE,
      (leaf) => new PocketItemListView(leaf, this)
    );
  }

  // Mount React app
  mount = () => {
    console.log("mounting React components");
    ReactDOM.render(
      createReactApp(this.viewManager),
      this.appEl ?? (this.appEl = document.body.createDiv())
    );
    console.log("done mounting React components");
  };

  async onunload() {
    console.log("unloading plugin");

    console.log("killing all views");
    this.killAllViews();
    this.viewManager = null;

    if (this.appEl) {
      ReactDOM.unmountComponentAtNode(this.appEl);
      this.appEl.detach();
    }

    console.log("closing Pocket item store");
    await closePocketItemStore(this.itemStore);
    this.itemStore = null;
  }

  killAllViews = () => {
    this.app.workspace
      .getLeavesOfType(POCKET_ITEM_LIST_VIEW_TYPE)
      .forEach((leaf) => leaf.detach());
    this.viewManager.views.forEach((view) => view.unload());
    this.viewManager.clearViews();
  };

  openPocketList = async () => {
    await this.app.workspace.activeLeaf.setViewState({
      type: POCKET_ITEM_LIST_VIEW_TYPE,
    });
  };

  addCommands = () => {
    this.addCommand({
      id: "open-pocket-list",
      name: "Open Pocket list",
      callback: () => {
        this.openPocketList();
      },
    });
  };
}
