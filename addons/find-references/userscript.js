/**
 * BlockItem 类用于表示一个 Blockly 的块项。
 *
 * @class
 * @param {Object} params - 初始化 BlockItem 的参数
 * @param {string} params.type - 块的类型
 * @param {string} params.category - 块所属的类别
 * @param {string} params.color - 块的颜色
 * @param {Function} params.func - 块的功能函数
 */
import BlockItem from "../find-bar/blockly/BlockItem.js";
import BlockInstance from "../find-bar/blockly/BlockInstance.js";
import Utils from "../find-bar/blockly/Utils.js";
import SVG_Utils from "./SVG_Utils.js";

/** @typedef {import("../../addon-api/content-script/typedef.js").UserscriptUtilities} UserscriptUtilities @param {UserscriptUtilities} */
export default async function ({ addon, msg, console }) {
  if (!addon.self._isDevtoolsExtension && window.initGUI) {
    console.log("Extension running, stopping addon");
    window._devtoolsAddonEnabled = true;
    window.dispatchEvent(new CustomEvent("scratchAddonsDevtoolsAddonStopped"));
    return;
  }

  const Blockly = await addon.tab.traps.getBlockly();

  class FindRefs {
    constructor() {
      this.isFloatWindowExpandedOnWidth = false;
      this.isFloatWindowExpandedOnHeight = false;
      this.utils = new Utils(addon);

      this.prevValue = "";

      this.findBarOuter = null;
      this.findWrapper = null;
      this.findInput = null;
      this.dropdownOut = null;
      this.dropdown = new Dropdown(this.utils);
      this.floatWindow = this.createFloatWindow();
      this.search_bar_label = null;
      this.fa_icon_search_bar = null;

      document.addEventListener("keydown", (e) => this.eventKeyDown(e), true);
    }

    get workspace() {
      return Blockly.getMainWorkspace();
    }

    createDom() {
      // need fa here
      const link = document.createElement("link");
      link.setAttribute("rel", "stylesheet");
      link.setAttribute("href", "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/5.15.2/css/all.min.css");
      document.head.appendChild(link);

      this.findBarOuter = document.createElement("div");
      this.findBarOuter.className = "sa-fr-bar";
      addon.tab.displayNoneWhileDisabled(this.findBarOuter, { display: "flex" });
      this.floatWindow.appendChild(this.findBarOuter);

      this.findWrapper = this.findBarOuter.appendChild(document.createElement("span"));
      this.findWrapper.className = "sa-fr-wrapper";

      this.dropdownOut = this.findWrapper.appendChild(document.createElement("label"));
      this.dropdownOut.className = "sa-fr-dropdown-out";

      const input_wrapper = this.dropdownOut.appendChild(document.createElement("div"));
      // add class
      input_wrapper.className = "sa-fr-input-wrapper";
      this.search_bar_label = input_wrapper.appendChild(document.createElement("label"));
      this.search_bar_label.setAttribute("for", "search_bar");
      this.fa_icon_search_bar = document.createElement("i");
      this.fa_icon_search_bar.classList.add("fas", "fa-eye", "search_icon");
      this.search_bar_label.appendChild(this.fa_icon_search_bar);
      input_wrapper.appendChild(this.search_bar_label);

      this.findInput = input_wrapper.appendChild(document.createElement("input"));
      this.findInput.className = addon.tab.scratchClass("input_input-form", {
        others: "sa-fr-input",
      });
      this.findInput.id = "sa-fr-input";
      this.findInput.type = "search";
      this.findInput.placeholder = msg("find-placeholder");
      this.findInput.autocomplete = "off";

      this.bindEvents();
      this.tabChanged();

      // ref_list
      const parentElement = document.createElement("ul");
      parentElement.id = "ref_list";
      this.floatWindow.appendChild(parentElement);
      document.querySelector("[class*='gui_tabs']").appendChild(this.floatWindow);

      this.dropdownOut.appendChild(this.dropdown.createDom());
    }

    createFloatWindow() {
      const floatWindow = document.createElement("div");
      floatWindow.id = "floatWindow";
      const scroll_width = document.querySelector("[class*='blocklyScrollbarHandle']").getAttribute("width");
      floatWindow.style.right = `${parseInt(scroll_width) + 3}px`;

      // middle click floatwindow to close it
      floatWindow.addEventListener("mousedown", (e) => {
        if (e.button === 1) {
          floatWindow.style.display = "none";
        }
      });

      floatWindow.showFloatWindow = function () {
        floatWindow.style.display = "block";
      };

      floatWindow.closeFloatWindow = function () {
        floatWindow.style.display = "none";
      };

      return floatWindow;
    }

    bindEvents() {
      this.findInput.addEventListener("focus", () => this.inputChange());
      this.findInput.addEventListener("keydown", (e) => this.inputKeyDown(e));
      this.findInput.addEventListener("keyup", () => this.inputChange());
      this.findInput.addEventListener("focusout", () => this.hideDropDown());
      this.fa_icon_search_bar.addEventListener("click", () => {
        if (this.isFloatWindowExpandedOnWidth) {
          this.findInput.style.paddingLeft = "0";
          this.findInput.style.marginRight = "0";
          this.fa_icon_search_bar.classList.remove("hovered");
          this.floatWindow.classList.remove("animate-expandWidth");
          this.floatWindow.classList.add("animate-contractWidth");
        } else {
          this.fa_icon_search_bar.classList.add("hovered");
          this.findInput.style.paddingLeft = "0.4em";
          this.findInput.style.marginRight = "0.5em";
          this.floatWindow.classList.remove("animate-contractWidth");
          this.floatWindow.classList.add("animate-expandWidth");
        }
        this.isFloatWindowExpandedOnWidth = !this.isFloatWindowExpandedOnWidth;
      });
    }

    tabChanged() {
      if (!this.findBarOuter) {
        return;
      }
      const tab = addon.tab.redux.state.scratchGui.editorTab.activeTabIndex;
      const visible = tab === 0 || tab === 1 || tab === 2;
      this.findBarOuter.hidden = !visible;
    }

    inputChange() {
      this.showDropDown();

      // Filter the list...
      let val = (this.findInput.value || "").toLowerCase();
      if (val === this.prevValue) {
        // No change so don't re-filter
        return;
      }
      this.prevValue = val;

      this.dropdown.blocks = null;

      // Hide items in list that do not contain filter text
      let listLI = this.dropdown.items;
      for (const li of listLI) {
        let procCode = li.data.procCode;
        let i = li.data.lower.indexOf(val);
        if (i >= 0) {
          li.style.display = "block";
          while (li.firstChild) {
            li.removeChild(li.firstChild); // it removes here
          }
          if (i > 0) {
            li.appendChild(document.createTextNode(procCode.substring(0, i)));
          }
          let bText = document.createElement("b");
          bText.appendChild(document.createTextNode(procCode.substr(i, val.length)));
          li.appendChild(bText);
          if (i + val.length < procCode.length) {
            li.appendChild(document.createTextNode(procCode.substr(i + val.length)));
          }
        } else {
          li.style.display = "none";
        }
      }

      console.log("test");
    }

    inputKeyDown(e) {
      this.dropdown.inputKeyDown(e);

      // Enter
      if (e.key === "Enter") {
        this.findInput.blur();
        return;
      }

      // Escape
      if (e.key === "Escape") {
        if (this.findInput.value.length > 0) {
          this.findInput.value = ""; // Clear search first, then close on second press
          this.inputChange();
        } else {
          this.findInput.blur();
        }
        e.preventDefault();
        return;
      }
    }

    eventKeyDown(e) {
      if (addon.self.disabled || !this.findBarOuter) return;

      let ctrlKey = e.ctrlKey || e.metaKey;
      if (e.key === "ArrowLeft" && ctrlKey) {
        // Ctrl + Left Arrow Key
        if (document.activeElement.tagName === "INPUT") {
          return;
        }

        if (this.selectedTab === 0) {
          this.utils.navigationHistory.goBack();
          e.cancelBubble = true;
          e.preventDefault();
          return true;
        }
      }

      if (e.key === "ArrowRight" && ctrlKey) {
        // Ctrl + Right Arrow Key
        if (document.activeElement.tagName === "INPUT") {
          return;
        }

        if (this.selectedTab === 0) {
          this.utils.navigationHistory.goForward();
          e.cancelBubble = true;
          e.preventDefault();
          return true;
        }
      }
    }

    showDropDown(focusID, instanceBlock) {
      // shiftKey hold click block focusID is the current blockID
      if (!focusID && this.dropdownOut.classList.contains("visible")) {
        return;
      }

      // special '' vs null... - null forces a reevaluation
      this.prevValue = focusID ? "" : null; // Clear the previous value of the input search

      this.dropdownOut.classList.add("visible");
      this.search_bar_label.classList.add("focus_on");
      this.findInput.classList.add("focus_on");
      if (!this.isFloatWindowExpandedOnHeight) {
        this.floatWindow.classList.add("animate-expandHeight");
      }

      let scratchBlocks =
        this.selectedTab === 0
          ? this.getScratchBlocks()
          : this.selectedTab === 1
          ? this.getScratchCostumes()
          : this.selectedTab === 2
          ? this.getScratchSounds()
          : [];

      this.dropdown.empty();

      for (const proc of scratchBlocks) {
        let item = this.dropdown.addItem(proc);

        if (focusID) {
          if (proc.matchesID(focusID)) {
            this.dropdown.onItemClick(item, instanceBlock);
            this.hideDropDown();
          } else {
            item.style.display = "none";
          }
        }
      }

      this.utils.offsetX = this.dropdownOut.getBoundingClientRect().width + 32;
      this.utils.offsetY = 32;
    }

    hideDropDown() {
      this.dropdownOut.classList.remove("visible");
      this.search_bar_label.classList.remove("focus_on");
      this.findInput.classList.remove("focus_on");
    }

    get selectedTab() {
      return addon.tab.redux.state.scratchGui.editorTab.activeTabIndex;
    }

    /**
     * 获取 Scratch 编辑器中的所有顶级块。
     *
     * @returns {Array<BlockItem>} 返回一个包含所有顶级块的数组。
     */
    getScratchBlocks() {
      let myBlocks = [];
      let myBlockSvgs = [];
      let myBlocksByProcCode = {};

      let topBlocks = this.workspace.getTopBlocks();

      /**
       * @param cls
       * @param txt
       * @param root
       * @returns BlockItem
       */
      function addBlock(cls, txt, root) {
        let id = root.id ? root.id : root.getId ? root.getId() : null;
        let clone = myBlocksByProcCode[txt];
        if (clone) {
          if (!clone.clones) {
            clone.clones = [];
          }
          clone.clones.push(id);
          return clone;
        }
        let items = new BlockItem(cls, txt, id, 0);
        items.y = root.getRelativeToSurfaceXY ? root.getRelativeToSurfaceXY().y : null;
        myBlocks.push(items);
        myBlocksByProcCode[txt] = items;
        return items;
      }

      function getDescFromField(root) {
        let fields = root.inputList[0];
        let desc;
        for (const fieldRow of fields.fieldRow) {
          desc = desc ? desc + " " : "";
          if (fieldRow instanceof Blockly.FieldImage && fieldRow.src_.endsWith("green-flag.svg")) {
            desc += msg("/_general/blocks/green-flag");
          } else {
            desc += fieldRow.getText();
          }
        }
        return desc;
      }

      for (const root of topBlocks) {
        if (root.type === "procedures_definition") {
          const label = root.getChildren()[0];
          const procCode = label.getProcCode();
          if (!procCode) {
            continue;
          }
          const indexOfLabel = root.inputList.findIndex((i) => i.fieldRow.length > 0);
          if (indexOfLabel === -1) {
            continue;
          }
          const translatedDefine = root.inputList[indexOfLabel].fieldRow[0].getText();
          const message = indexOfLabel === 0 ? `${translatedDefine} ${procCode}` : `${procCode} ${translatedDefine}`;
          addBlock("define", message, root);
          continue;
        }

        if (root.type === "event_whenflagclicked") {
          addBlock("flag", getDescFromField(root), root); // "When Flag Clicked"
          continue;
        }

        if (root.type === "event_whenbroadcastreceived") {
          const fieldRow = root.inputList[0].fieldRow;
          let eventName = fieldRow.find((input) => input.name === "BROADCAST_OPTION").getText();
          addBlock("receive", msg("event", { name: eventName }), root).eventName = eventName;

          continue;
        }

        if (root.type.substr(0, 10) === "event_when") {
          addBlock("event", getDescFromField(root), root); // "When Flag Clicked"
          continue;
        }

        if (root.type === "control_start_as_clone") {
          addBlock("event", getDescFromField(root), root); // "when I start as a clone"
          continue;
        }
      }

      let map = this.workspace.getVariableMap();

      let vars = map.getVariablesOfType("");
      for (const row of vars) {
        addBlock(
          row.isLocal ? "var" : "VAR",
          row.isLocal ? msg("var-local", { name: row.name }) : msg("var-global", { name: row.name }),
          row
        );
      }

      let lists = map.getVariablesOfType("list");
      for (const row of lists) {
        addBlock(
          row.isLocal ? "list" : "LIST",
          row.isLocal ? msg("list-local", { name: row.name }) : msg("list-global", { name: row.name }),
          row
        );
      }

      const events = this.getCallsToEvents();
      for (const event of events) {
        addBlock("receive", msg("event", { name: event.eventName }), event.block).eventName = event.eventName;
      }

      const clsOrder = { flag: 0, receive: 1, event: 2, define: 3, var: 4, VAR: 5, list: 6, LIST: 7 };

      myBlocks.sort((a, b) => {
        let t = clsOrder[a.cls] - clsOrder[b.cls];
        if (t !== 0) {
          return t;
        }
        if (a.lower < b.lower) {
          return -1;
        }
        if (a.lower > b.lower) {
          return 1;
        }
        return a.y - b.y;
      });

      return myBlocks;
    }

    /**
     * 获取 Scratch 编辑器中的所有顶级块。
     *
     * @returns {Array<BlockItem>} 返回一个包含所有顶级块的数组。
     */
    getScratchCostumes() {
      let costumes = this.utils.getEditingTarget().getCostumes();

      let items = [];

      let i = 0;
      for (const costume of costumes) {
        let item = new BlockItem("costume", costume.name, costume.assetId, i);
        items.push(item);
        i++;
      }

      return items;
    }

    /**
     *
     * @returns {Array<BlockItem>} 返回一个包含所有顶级块的数组。
     */
    getScratchSounds() {
      let sounds = this.utils.getEditingTarget().getSounds();

      let items = [];

      let i = 0;
      for (const sound of sounds) {
        let item = new BlockItem("sound", sound.name, sound.assetId, i);
        items.push(item);
        i++;
      }

      return items;
    }

    getCallsToEvents() {
      const uses = [];
      const alreadyFound = new Set();

      for (const block of this.workspace.getAllBlocks()) {
        if (block.type !== "event_broadcast" && block.type !== "event_broadcastandwait") {
          continue;
        }

        const broadcastInput = block.getChildren()[0];
        if (!broadcastInput) {
          continue;
        }

        let eventName = "";
        if (broadcastInput.type === "event_broadcast_menu") {
          eventName = broadcastInput.inputList[0].fieldRow[0].getText();
        } else {
          eventName = msg("complex-broadcast");
        }
        if (!alreadyFound.has(eventName)) {
          alreadyFound.add(eventName);
          uses.push({ eventName: eventName, block: block });
        }
      }

      return uses;
    }
  }

  /**
   * A Dropdown class for displaying a list of items and allowing the user to select one.
   *
   * @class
   * @param {Utils} utils - An instance of the Utils class from blockly/utils.js.
   */
  class Dropdown {
    /**
     * Constructs a new Dropdown instance.
     *
     * @constructor
     * @param {Utils} utils - An instance of the Utils class from blockly/utils.js.
     */
    constructor(utils) {
      this.utils = utils;
      this.svg_utils = new SVG_Utils(addon);
      this.el = null;
      this.items = [];
      this.selected = null;
      this.hovered = null;
      this.carousel = new Carousel(this.utils);
      this.fr_result_list = null;
      this.blocks_ids = [];
    }

    get workspace() {
      return Blockly.getMainWorkspace();
    }

    createDom() {
      this.el = document.createElement("ul");
      this.el.className = "sa-fr-dropdown";
      this.fr_result_list = document.querySelector("#ref_list");
      return this.el;
    }

    inputKeyDown(e) {
      // Up Arrow
      if (e.key === "ArrowUp") {
        this.navigateFilter(-1);
        e.preventDefault();
        return;
      }

      // Down Arrow
      if (e.key === "ArrowDown") {
        this.navigateFilter(1);
        e.preventDefault();
        return;
      }

      // Enter
      if (e.key === "Enter") {
        // Any selected on enter? if not select now
        if (this.selected) {
          this.navigateFilter(1);
        }
        e.preventDefault();
        return;
      }

      this.carousel.inputKeyDown(e);
    }

    navigateFilter(dir) {
      let nxt;
      if (this.selected && this.selected.style.display !== "none") {
        nxt = dir === -1 ? this.selected.previousSibling : this.selected.nextSibling;
      } else {
        nxt = this.items[0];
        dir = 1;
      }
      while (nxt && nxt.style.display === "none") {
        nxt = dir === -1 ? nxt.previousSibling : nxt.nextSibling;
      }
      if (nxt) {
        nxt.scrollIntoView({ block: "nearest" });
        this.onItemClick(nxt);
      }
    }

    addItem(proc) {
      const item = document.createElement("li");
      item.innerText = proc.procCode;
      item.data = proc;
      const colorIds = {
        receive: "events",
        event: "events",
        define: "more",
        var: "data",
        VAR: "data",
        list: "data-lists",
        LIST: "data-lists",
        costume: "looks",
        sound: "sounds",
      };
      if (proc.cls === "flag") {
        item.className = "sa-find-flag";
      } else {
        const colorId = colorIds[proc.cls];
        item.className = `sa-block-color sa-block-color-${colorId}`;
      }

      item.addEventListener("mousedown", (e) => {
        this.onItemClick(item);
        e.preventDefault();
        e.cancelBubble = true;
        return false;
      });

      item.addEventListener("mouseleave", (e) => {
        // 隐藏浮动窗口
        this.hovered = null;
        e.preventDefault();
      });

      this.items.push(item);
      this.el.appendChild(item);
      return item;
    }

    onItemHover(item, instanceBlock) {
      if (this.hovered && this.hovered !== item) {
        this.hovered.classList.remove("hov");
        this.hovered = null;
      }
      if (this.hovered !== item) {
        item.classList.add("hov");
        this.hovered = item;
      }

      let cls = item.data.cls;
      if (cls === "costume" || cls === "sound") {
      } else if (cls === "var" || cls === "VAR" || cls === "list" || cls === "LIST") {
        // Search now for all instances
        let blocks = this.getVariableUsesById(item.data.labelID);
        for (const block of blocks) {
          const li_item = document.createElement("li");
          li_item.textContent = block.type + " the text is :" + block.id;
          // mouse enter
          li_item.addEventListener("mouseenter", (e) => {
            if (this.hovered && this.hovered !== li_item) {
              this.hovered.classList.remove("hov");
              this.hovered = null;
            }
            // if (this.hovered !== li_item) {
            //   li_item.classList.add("hov");
            //   this.hovered = li_item;
            // }
            // mouse leave
            li_item.addEventListener("mouseleave", (e) => {
              if (this.hovered && this.hovered !== li_item) {
                this.hovered.classList.remove("hov");
                this.hovered = null;
              }
              this.hovered = null;
            });
          });

          this.fr_result_list.appendChild(li_item);
        }
      } else if (cls === "define") {
        let blocks = this.getCallsToProcedureById(item.data.labelID);
        this.carousel.build(item, blocks, instanceBlock);
      } else if (cls === "receive") {
        // Now, fetch the events from the scratch runtime instead of blockly
        let blocks = this.getCallsToEventsByName(item.data.eventName);
        if (!instanceBlock) {
          // Can we start by selecting the first block on 'this' sprite
          const currentTargetID = this.utils.getEditingTarget().id;
          for (const block of blocks) {
            if (block.targetId === currentTargetID) {
              instanceBlock = block;
              break;
            }
          }
        }
        this.carousel.build(item, blocks, instanceBlock);
      } else if (item.data.clones) {
        let blocks = [this.workspace.getBlockById(item.data.labelID)];
        for (const cloneID of item.data.clones) {
          blocks.push(this.workspace.getBlockById(cloneID));
        }
        this.carousel.build(item, blocks, instanceBlock);
      } else {
        this.utils.scrollBlockIntoView(item.data.labelID);
        this.carousel.remove();
      }
    }

    onItemClick(item, instanceBlock) {
      // init set
      this.myBlockSvgs = [];
      this.blocks_ids = [];
      while (this.fr_result_list.firstChild) {
        this.fr_result_list.removeChild(this.fr_result_list.firstChild);
      }

      if (this.selected && this.selected !== item) {
        this.selected.classList.remove("sel");
        this.selected = null;
      }
      if (this.selected !== item) {
        item.classList.add("sel");
        this.selected = item;
      }

      let blocks = null;
      let cls = item.data.cls;
      if (cls === "costume" || cls === "sound") {
        // Viewing costumes/sounds - jump to selected costume/sound
        const assetPanel = document.querySelector("[class^=asset-panel_wrapper]");
        if (assetPanel) {
          const reactInstance = assetPanel[addon.tab.traps.getInternalKey(assetPanel)];
          const reactProps = reactInstance.pendingProps.children[0].props;
          reactProps.onItemClick(item.data.y);
          const selectorList = assetPanel.firstChild.firstChild;
          selectorList.children[item.data.y].scrollIntoView({
            behavior: "auto",
            block: "center",
            inline: "start",
          });
          // The wrapper seems to scroll when we use the function above.
          let wrapper = assetPanel.closest("div[class*=gui_flex-wrapper]");
          wrapper.scrollTop = 0;
        }
      } else if (cls === "var" || cls === "VAR" || cls === "list" || cls === "LIST") {
        // Search now for all instances
        blocks = this.getVariableUsesById(item.data.labelID);
        this.carousel.build(item, blocks, instanceBlock);
      } else if (cls === "define") {
        blocks = this.getCallsToProcedureById(item.data.labelID);
        this.carousel.build(item, blocks, instanceBlock);
      } else if (cls === "receive") {
        // Now, fetch the events from the scratch runtime instead of blockly
        blocks = this.getCallsToEventsByName(item.data.eventName);
        if (!instanceBlock) {
          // Can we start by selecting the first block on 'this' sprite
          const currentTargetID = this.utils.getEditingTarget().id;
          for (const block of blocks) {
            if (block.targetId === currentTargetID) {
              instanceBlock = block;
              break;
            }
          }
        }
        this.carousel.build(item, blocks, instanceBlock);
      } else if (item.data.clones) {
        blocks = [this.workspace.getBlockById(item.data.labelID)];
        for (const cloneID of item.data.clones) {
          blocks.push(this.workspace.getBlockById(cloneID));
        }
        this.carousel.build(item, blocks, instanceBlock);
      } else {
        this.utils.scrollBlockIntoView(item.data.labelID);
        this.carousel.remove();
      }

      // Create the header li item
      const header_item = document.createElement("li");
      // add header to it
      header_item.classList.add("header");

      // Add the header content
      const header_content = document.createElement("div");
      header_content.textContent = "start block";
      header_item.appendChild(header_content);

      // Add the second column content
      const second_column = document.createElement("div");
      second_column.textContent = "directly use block";
      header_item.appendChild(second_column);

      // Add the header li item to the parent element
      this.fr_result_list.appendChild(header_item);
      if (blocks != null) {
        for (const block of blocks) {
          const li_item = document.createElement("li");
          li_item.classList.add("ref_result");
          if (this.blocks_ids.includes(block.id)) {
            continue;
          } else {
            this.blocks_ids.push(block.id);
          }
          li_item.setAttribute("blockID", block.id);
          // mouse enter
          li_item.addEventListener("mouseenter", (e) => {
            if (this.hovered && this.hovered !== li_item) {
              this.hovered.classList.remove("hov");
              this.hovered = null;
            }

            // click
            li_item.addEventListener("click", (e) => {
              const blockId = li_item.getAttribute("blockID");
              this.utils.scrollBlockIntoView(blockId);
            });

            // mouse leave
            li_item.addEventListener("mouseleave", (e) => {
              if (this.hovered && this.hovered !== li_item) {
                this.hovered.classList.remove("hov");
                this.hovered = null;
              }
              this.hovered = null;
            });
          });

          // Get First Block of Current blockGroup
          const firstBlock = this.getFirstBlock(block);
          const noRepBlock = this.getNearestNoReporterBlock(block);

          this.svg_utils.getSVGElement(firstBlock, enabledAddons, false).then((svg1) => {
            // 获取最近的 SVG
            this.svg_utils.getSVGElement(noRepBlock, enabledAddons, true).then((svg2) => {
              if (firstBlock.startHat_ && !noRepBlock.startHat_) {
                const scale = 0.6;
                svg1.setAttribute("transform", `translate(0,${scale * -16})`);
              }
              li_item.appendChild(svg1); // 使用 svg1 引用第一个 SVG
              li_item.appendChild(svg2); // 使用 svg2 引用第二个 SVG，避免覆盖
            });
          });

          this.fr_result_list.appendChild(li_item);
        }
      }
    }

    getFirstBlock(blocksvg) {
      let currentBlock = blocksvg;
      while (currentBlock.parentBlock_ !== null) {
        currentBlock = currentBlock.parentBlock_;
      }

      return currentBlock;
    }

    getNearestNoReporterBlock(currentBlock) {
      while (
        (currentBlock.svgGroup_.getAttribute("data-shapes") === "reporter round" ||
          currentBlock.svgGroup_.getAttribute("data-shapes") === "reporter boolean") &&
        currentBlock.parentBlock_ !== null
      ) {
        currentBlock = currentBlock.parentBlock_;
      }
      return currentBlock;
    }

    getVariableUsesById(id) {
      let uses = [];
      let topBlocks = this.workspace.getTopBlocks();

      for (const topBlock of topBlocks) {
        /** @type {!Array<!Blockly.Block>} */
        let kids = topBlock.getDescendants();
        for (const block of kids) {
          /** @type {!Array<!Blockly.VariableModel>} */
          let blockVariables = block.getVarModels();
          if (blockVariables) {
            for (const blockVar of blockVariables) {
              if (blockVar.getId() === id) {
                uses.push(block);
              }
            }
          }
        }
      }

      return uses;
    }

    getCallsToProcedureById(id) {
      let procBlock = this.workspace.getBlockById(id);
      let label = procBlock.getChildren()[0];
      let procCode = label.getProcCode();

      let uses = [procBlock]; // Definition First, then calls to it
      let topBlocks = this.workspace.getTopBlocks();
      for (const topBlock of topBlocks) {
        /** @type {!Array<!Blockly.Block>} */
        let kids = topBlock.getDescendants();
        for (const block of kids) {
          if (block.type === "procedures_call") {
            if (block.getProcCode() === procCode) {
              uses.push(block);
            }
          }
        }
      }

      return uses;
    }

    getCallsToEventsByName(name) {
      let uses = []; // Definition First, then calls to it

      const runtime = addon.tab.traps.vm.runtime;
      const targets = runtime.targets; // The sprites / stage

      for (const target of targets) {
        if (!target.isOriginal) {
          continue; // Skip clones
        }

        const blocks = target.blocks;
        if (!blocks._blocks) {
          continue;
        }

        for (const id of Object.keys(blocks._blocks)) {
          const block = blocks._blocks[id];
          if (block.opcode === "event_whenbroadcastreceived" && block.fields.BROADCAST_OPTION.value === name) {
            uses.push(new BlockInstance(target, block));
          } else if (block.opcode === "event_broadcast" || block.opcode === "event_broadcastandwait") {
            const broadcastInputBlockId = block.inputs.BROADCAST_INPUT.block;
            const broadcastInputBlock = blocks._blocks[broadcastInputBlockId];
            if (broadcastInputBlock) {
              let eventName;
              if (broadcastInputBlock.opcode === "event_broadcast_menu") {
                eventName = broadcastInputBlock.fields.BROADCAST_OPTION.value;
              } else {
                eventName = msg("complex-broadcast");
              }
              if (eventName === name) {
                uses.push(new BlockInstance(target, block));
              }
            }
          }
        }
      }

      return uses;
    }

    empty() {
      for (const item of this.items) {
        if (this.el.contains(item)) {
          this.el.removeChild(item);
        }
      }
      this.items = [];
      this.selected = null;
    }
  }

  class Carousel {
    constructor(utils) {
      this.utils = utils;

      this.el = null;
      this.count = null;
      this.blocks = [];
      this.idx = 0;
    }

    build(item, blocks, instanceBlock) {
      if (this.el && this.el.parentNode === item) {
        // Same control... click again to go to next
        this.navRight();
      } else {
        this.remove();
        this.blocks = blocks;
        item.appendChild(this.createDom());

        this.idx = 0;
        if (instanceBlock) {
          for (const idx of Object.keys(this.blocks)) {
            const block = this.blocks[idx];
            if (block.id === instanceBlock.id) {
              this.idx = Number(idx);
              break;
            }
          }
        }

        if (this.idx < this.blocks.length) {
          this.utils.scrollBlockIntoView(this.blocks[this.idx]);
        }
      }
    }

    createDom() {
      this.el = document.createElement("span");
      this.el.className = "sa-find-carousel";

      const leftControl = this.el.appendChild(document.createElement("span"));
      leftControl.className = "sa-find-carousel-control";
      leftControl.textContent = "◀";
      leftControl.addEventListener("mousedown", (e) => this.navLeft(e));

      this.count = this.el.appendChild(document.createElement("span"));
      this.count.innerText = this.blocks.length > 0 ? this.idx + 1 + " / " + this.blocks.length : "0";

      const rightControl = this.el.appendChild(document.createElement("span"));
      rightControl.className = "sa-find-carousel-control";
      rightControl.textContent = "▶";
      rightControl.addEventListener("mousedown", (e) => this.navRight(e));

      return this.el;
    }

    inputKeyDown(e) {
      // Left Arrow
      if (e.key === "ArrowLeft") {
        if (this.el && this.blocks) {
          this.navLeft(e);
        }
      }

      // Right Arrow
      if (e.key === "ArrowRight") {
        if (this.el && this.blocks) {
          this.navRight(e);
        }
      }
    }

    navLeft(e) {
      return this.navSideways(e, -1);
    }

    navRight(e) {
      return this.navSideways(e, 1);
    }

    navSideways(e, dir) {
      if (this.blocks.length > 0) {
        this.idx = (this.idx + dir + this.blocks.length) % this.blocks.length; // + length to fix negative modulo js issue.
        this.count.innerText = this.idx + 1 + " / " + this.blocks.length;
        this.utils.scrollBlockIntoView(this.blocks[this.idx]);
      }

      if (e) {
        e.cancelBubble = true;
        e.preventDefault();
      }
    }

    remove() {
      if (this.el) {
        this.el.remove();
        this.blocks = [];
        this.idx = 0;
      }
    }
  }

  // switch to small pane used for test
  const element = document.querySelector('[class*="toggle-buttons_button"]');
  if (element) {
    element.click();
  }

  const findBar = new FindRefs();
  window.fb = findBar;
  const enabledAddons = await addon.self.getEnabledAddons("codeEditor");

  addon.tab.redux.initialize();
  addon.tab.redux.addEventListener("statechanged", (e) => {
    if (e.detail.action.type === "scratch-gui/navigation/ACTIVATE_TAB") {
      findBar.tabChanged();
    }
  });

  while (true) {
    const root = await addon.tab.waitForElement("ul[class*=gui_tab-list_]", {
      markAsSeen: true,
      reduxEvents: ["scratch-gui/mode/SET_PLAYER", "fontsLoaded/SET_FONTS_LOADED", "scratch-gui/locales/SELECT_LOCALE"],
      reduxCondition: (state) => !state.scratchGui.mode.isPlayerOnly,
    });
    findBar.createDom();
  }
}
