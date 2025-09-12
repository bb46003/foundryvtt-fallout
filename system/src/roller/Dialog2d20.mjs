import {APTracker} from "../apps/APTracker.mjs";

export class Dialog2d20 extends foundry.applications.api.ApplicationV2 {
	static DEFAULT_OPTIONS = {
		window: { title: "Roll D20" },
		template: "systems/fallout/templates/dialogs/dialog2d20.hbs",
		actions: {
			modifyNumberOfDice: Dialog2d20.#modifyNumberOfDice,
			roll: Dialog2d20.#rollButton,
		},
	};

	constructor({
		rollName = "Roll D20",
		diceNum = 2,
		attribute = 0,
		skill = 0,
		tag = false,
		complication = 20,
		rollLocation = false,
		actor = null,
		item = null,
	} = {}) {
		super();
		this.rollName = rollName;
		this.diceNum = diceNum;
		this.attribute = attribute;
		this.skill = skill;
		this.tag = tag;
		this.complication = complication;
		this.rollLocation = rollLocation;
		this.actor = actor;
		this.item = item;
		this.rolling = false;
		this.deferred = new Deferred();
	}

	async getData() {
		try {
			return {
				rollName: this.rollName,
				diceNum: this.diceNum,
				attribute: this.attribute,
				skill: this.skill,
				tag: this.tag,
				complication: this.complication,
				rollLocation: this.rollLocation,
				actor: this.actor,
				item: this.item,
				dificulty: CONFIG.FALLOUT.DIFFICULTY,
				partyAP: game.settings.get(SYSTEM_ID, "partyAP"),
			};
		}
		catch(e) {
			console.error("getData error:", e);
			return {};
		}
	}

	async _renderHTML() {
		try {
			if (game.release.generation > 12) {
      			// eslint-disable-next-line max-len
      			return foundry.applications.handlebars.renderTemplate(this.options.template, await this.getData());
   			}
 			else {
     	 		return renderTemplate(this.options.template, await this.getData());
   			}
		}
		catch(e) {
			console.error("_renderHTML error:", e);
			throw e;
		}
	}

	async _replaceHTML(result, html) {
		html.innerHTML = result;
	}

	static async #rollButton() {
		const html = this.element;
		const attr = html.querySelector('[name="attribute"]')?.value;
		const skill = html.querySelector('[name="skill"]')?.value;
		const complication = html.querySelector('[name="complication"]')?.value;
		const isTag = html.querySelector('[name="tag"]')?.checked;
		const difficultySelect = html.querySelector('[name="dificulty"]');
		const dificulty = Number(difficultySelect.options[difficultySelect.selectedIndex].text);
		const diceNum = html.querySelector(".dice-icon.d20.marked").dataset.index;
		this.rolling = true;

		const result = await fallout.Roller2D20.rollD20({
			rollname: this.rollName,
			dicenum: diceNum,
			attribute: attr,
			skill: skill,
			tag: isTag,
			complication: complication,
			rollLocation: this.rollLocation,
			item: this.item,
			actor: this.actor,
			dificulty: dificulty,
		});

		this.deferred.resolve(result);

		// Automatic ammo reduction
		if (game.settings.get("fallout", "automaticAmmunitionCalculation")) {
			const actorType = this.actor?.type;
			if (["character", "robot", "vehicle"].includes(actorType)) {
				if (this.actor && this.item?.system.ammo) {
					try {
						this.actor.reduceAmmo(
							this.item.system.ammo,
							this.item.system.ammoPerShot
						);
					}
					catch(err) {
						console.warn(err);
					}
				}
			}
		}
		const elementSpendPartyAP = html.querySelector("#spendAP");
		let spendPartyAP = 0;
		if (elementSpendPartyAP !== null) {
			spendPartyAP = Number(elementSpendPartyAP.dataset.spend);
		}
		const elementBuyedFromOverseer = html.querySelector("#buyedAP");
		let buyedFromOverseer = 0;
		if (elementBuyedFromOverseer !== null) {
			buyedFromOverseer = Number(elementBuyedFromOverseer.dataset.buyed);
		}
		this.modyfyAP(spendPartyAP, buyedFromOverseer);
		this.close();
	}

	async close() {
		super.close();
		if (!this.rolling) {
			this.deferred.resolve(null);
		}
	}

	static async createDialog(params = {}) {
		const dialog = new Dialog2d20(params);
		dialog.render(true);
		return dialog.deferred.promise;
	}

	async modyfyAP(spendPartyAP, buyedFromOverseer) {
		const currentPartyAP =  game.settings.get(SYSTEM_ID, "partyAP");
		const currentOverseerAP = game.settings.get(SYSTEM_ID, "gmAP");
		if (spendPartyAP !== 0) {
			const newPartyAP = currentPartyAP - spendPartyAP;
			APTracker.setAP("partyAP", newPartyAP);
		}
		if (buyedFromOverseer !== 0) {
			const newOverseerAP = currentOverseerAP + buyedFromOverseer;
			APTracker.setAP("gmAP", newOverseerAP );
		}

	}

	static async #modifyNumberOfDice(event) {
		const target = event.target;
		const dialogHTML = target.offsetParent;
		const markedDice = dialogHTML.querySelector(".dice-icon.d20.marked");
		const actionType = target.dataset.type;
		let numberOfDice;
		if (actionType === "add") {
			numberOfDice = Number(markedDice.dataset.index) + 1;
		}
		else if (actionType === "remove") {
			numberOfDice = Number(markedDice.dataset.index) - 1;
		}
		else if (actionType === "dice") {
			numberOfDice = Number(target.dataset.index);
		}
		if (numberOfDice <6 && numberOfDice > 0) {
			dialogHTML.querySelectorAll(".dice-icon").forEach(el => el.classList.remove("marked"));
			const selected = dialogHTML.querySelector(`[data-index="${numberOfDice}"]`);
			if (selected) {
				selected.classList.add("marked");
			}
			const partyAP = dialogHTML.querySelector("#partyAP");
			const avaliablePartyAP = game.settings.get(SYSTEM_ID, "partyAP");
			let spendAP = 0;
			switch (numberOfDice) {
				case 3:
					spendAP = 1;
					break;
				case 4:
					spendAP = 3;
					break;
				case 5:
					spendAP = 6;
					break;
				default:
					spendAP = 0;
			}
			const leftPartyAP = avaliablePartyAP - spendAP;
			if (leftPartyAP < 0) {
				ui.notifications.warn(game.i18n.localize("FALLOUT.UI.YOU_BUY_AP_FROM_OVERSEER"));
				const buyedAP = -1 * leftPartyAP;
				const existBuyAP = dialogHTML.querySelector("#buyedAP");
				if (existBuyAP !== null) {
					existBuyAP.remove();
				}
				const buyAPFromOverseer = `<p id="buyedAP" data-buyed = ${buyedAP}>${game.i18n.localize("FALLOUT.TEMPLATE.BUY_FROM_OVERSEER")}:${buyedAP}</p>`;
				partyAP.insertAdjacentHTML("afterend", buyAPFromOverseer);
			}
			else {
				const existSpendAP = dialogHTML.querySelector("#spendAP");
				if (existSpendAP !== null) {
					existSpendAP.remove();
				}
				const existBuyAP = dialogHTML.querySelector("#buyedAP");
				if (existBuyAP !== null) {
					existBuyAP.remove();
				}
				const spendAPHTML = `<p id="spendAP" data-spend=${spendAP}>${game.i18n.localize("FALLOUT.TEMPLATE.SPEND_AP")}:${spendAP}</p>`;
				partyAP.insertAdjacentHTML("afterend", spendAPHTML);
			}
			if (spendAP === 0) {
				const existSpendAP = dialogHTML.querySelector("#spendAP");
				if (existSpendAP !== null) {
					existSpendAP.remove();
				}
				const existBuyAP = dialogHTML.querySelector("#buyedAP");
				if (existBuyAP !== null) {
					existBuyAP.remove();
				}
			}
	 	}
		else {
			ui.notifications.warn(game.i18n.localize("FALLOUT.UI.MAXIMUM_NUMBER_OF_DICE"));
		}
	}
}

// Deferred helper
class Deferred {
	constructor() {
		this.promise = new Promise((resolve, reject) => {
			this.resolve = resolve;
			this.reject = reject;
		});
	}
}
