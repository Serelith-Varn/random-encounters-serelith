export default class RandomEncounter {
    static printMessage(title, result) {
        let message = "";
        if (result == "None") {
            message = "No random encounter";
        }
        else {
            message = `The party has come across an <b>Encounter</b> ${result}`;
        }
        ChatMessage.create({
            user: game.user.id,
            content: `<h2>Random Encounter for ${title}</h2>${message}`,
            whisper: game.users.contents.filter((u) => u.isGM).map((u) => u.id),
        });
    }

    static checkRooms(tokens, scene, room_tags) {
        console.debug(`random-encounters | checking if tokens are in rooms ${room_tags}`);
        if (room_tags == "") {
            return true;
        }
        if (tokens.length == 0) {
            return false;
        }

        const rooms = Tagger.getByTag(room_tags, {
            matchAny: true,
            sceneId: scene._id,
        });

        for (var r = 0; r < rooms.length; r++) {
            console.debug(`random-encounters | checking room ${rooms[r]._id}`);
            for (var j = 0; j < tokens.length; j++) {
                console.debug(`random-encounters | checking token ${tokens[j]._id}`);
                let point = {
                    x: tokens[j].x + tokens[j].width / 2,
                    y: tokens[j].y + tokens[j].height / 2,
                };
                if (rooms[r].rotation) {
                    const center = {
                        x: rooms[r].x + rooms[r].shape.width / 2,
                        y: rooms[r].y + rooms[r].shape.height / 2,
                    };
                    const rotation_cos = Math.cos((-rooms[r].rotation * Math.PI) / 180);
                    const rotation_sin = Math.sin((-rooms[r].rotation * Math.PI) / 180);
                    point = {
                        x: center.x + (point.x - center.x) * rotation_cos - (point.y - center.y) * rotation_sin,
                        y: center.y + (point.x - center.x) * rotation_sin - (point.y - center.y) * rotation_cos,
                    };
                }

                var box = {
                    x: rooms[r].x,
                    y: rooms[r].y,
                    width: rooms[r].shape.width,
                    height: rooms[r].shape.height,
                };
                if (rooms[r].shape.type === foundry.data.ShapeData.TYPES.POLYGON) {
                    let xMin = Number.MAX_VALUE;
                    let xMax = Number.MIN_VALUE;
                    let yMin = Number.MAX_VALUE;
                    let yMax = Number.MIN_VALUE;
                    let points = [];
                    if (rooms[r].shape.points.length && rooms[r].shape.points[0].x !== undefined) {
                        points = rooms[r].shape.points;
                    } else {
                        for (var i = 0; i < rooms[r].shape.points.length; i += 2) {
                            points.push([rooms[r].shape.points[i], rooms[r].shape.points[i + 1]]);
                        }
                    }
                    points.forEach((p) => {
                        const px = Array.isArray(p) ? p[0] + rooms[r].x : p.x + rooms[r].x;
                        const py = Array.isArray(p) ? p[1] + rooms[r].y : p.y + rooms[r].y;
                        xMin = Math.min(xMin, px);
                        xMax = Math.max(xMax, px);
                        yMin = Math.min(yMin, py);
                        yMax = Math.max(yMax, py);
                    });
                    box = {
                        x: xMin,
                        y: yMin,
                        width: xMax - xMin,
                        height: yMax - yMin,
                    };
                }
                if (!(point.x >= box.x && point.x <= box.x + box.width && point.y >= box.y && point.y <= box.y + box.height)) {
                    continue;
                }
                if (rooms[r].shape.type === foundry.data.ShapeData.TYPES.RECTANGLE) {
                    return true;
                }
                if (rooms[r].shape.type === foundry.data.ShapeData.TYPES.ELLIPSE) {
                    if (!rooms[r].shape.width || !rooms[r].shape.height) {
                        continue;
                    }
                    const dx = rooms[r].x + rooms[r].shape.width / 2 - point.x;
                    const dy = rooms[r].y + rooms[r].shape.height / 2 - point.y;
                    if ((4 * (dx * dx)) / (rooms[r].shape.width * rooms[r].shape.width) + (4 * (dy * dy)) / (rooms[r].shape.height * rooms[r].shape.height) <= 1) {
                        return true;
                    }
                }
                if (rooms[r].shape.type === foundry.data.ShapeData.TYPES.POLYGON) {
                    const points = [];
                    if (rooms[r].shape.points.length && rooms[r].shape.points[0].x !== undefined) {
                        for (let p of rooms[r].shape.points) points.push([p.x, p.y]);
                    } else {
                        for (var i = 0; i < rooms[r].shape.points.length; i += 2) {
                            points.push([rooms[r].shape.points[i], rooms[r].shape.points[i + 1]]);
                        }
                    }
                    const cx = point.x - rooms[r].x;
                    const cy = point.y - rooms[r].y;
                    let w = 0;
                    for (let i0 = 0; i0 < points.length; ++i0) {
                        let i1 = i0 + 1 === points.length ? 0 : i0 + 1;
                        if (points[i0][1] <= cy && points[i1][1] > cy && (points[i1][0] - points[i0][0]) * (cy - points[i0][1]) - (points[i1][1] - points[i0][1]) * (cx - points[i0][0]) > 0) {
                            ++w;
                        }
                        if (points[i0][1] > cy && points[i1][1] <= cy && (points[i1][0] - points[i0][0]) * (cy - points[i0][1]) - (points[i1][1] - points[i0][1]) * (cx - points[i0][0]) < 0) {
                            --w;
                        }
                    }
                    if (w !== 0) {
                        return true;
                    }
                }
            }
        }
        return false;
    }

    static async doRandomEncounters(encounter = null) {
        if (game.combat || !game.users.filter((a) => a.id == game.userId)[0].isGM) {
            return false;
        }
        let scene = game.scenes.find((a) => a.active);
        let dayNight = scene.environment?.darknessLevel == 0 ? "Day" : "Night";
        let pc_tokens = scene.tokens.filter((a) => !a.isNPC);

        console.log(`random-encounters | checking if scene '${scene.name}' has encounters`);
        let encounters = [];

        if (encounter) {
            console.debug("random-encounters | encounter was passed in checking conditions");
            if (encounter.scene == scene.name && (encounter.daynight == dayNight || encounter.daynight == "None") && RandomEncounter.checkRooms(pc_tokens, scene, encounter.rooms)) {
                encounters.push(encounter);
            }
        }
        else {
            encounters = game.settings.get("random-encounters", "encounters").filter((a) => a.scene == scene.name).filter((a) => a.daynight == dayNight || a.daynight == "None").filter((a) => RandomEncounter.checkRooms(pc_tokens, scene, a.rooms));
        }

        for (var i = 0; i < encounters.length; i++) {
            console.log("random-encounters | checking for random encounter");
            let doRollTable = false;
            if (encounters[i].chance == "") {
                doRollTable = true;
            }
            else {
                console.debug("random-encounters | roll for chance encounter");
                var roll = new Roll(encounters[i].chance, {});
                var roll_evaluate = await roll.evaluate();
                var roll_result = roll_evaluate.total;
                if (encounters[i].onresult.includes("-")) {
                    var range = encounters[i].onresult.split("-");
                    if (roll_result >= parseInt(range[0]) && roll_result <= parseInt(range[1])) {
                        doRollTable = true;
                    }
                }
                else {
                    if (roll_result == parseInt(encounters[i].onresult)) {
                        doRollTable = true;
                    }
                }
            }
            if (doRollTable) {
                console.log(`random-encounters | random encounter '${encounters[i].name}' has been triggered`);
                var table = null;
                if (encounters[i].compendium != null) {
                    let pack = await game.packs.get(encounters[i].compendium).getIndex();
                    let tableData = await pack.getName(encounters[i].rolltable.split(" - ")[1]);
                    table = await fromUuid(tableData.uuid);
                }
                else {
                    table = game.tables.getName(encounters[i].rolltable);
                }
                if (game.settings.get("random-encounters", "brt") && table.flags.hasOwnProperty("better-rolltables") && table.flags["better-rolltables"]["table-type"] != null) {
                    await game.modules.get("better-rolltables").api.betterTableRoll(table, { rollMode: "gmroll" });
                }
                else {
                    var tableRoll = await table.roll();
                    var tableResult = tableRoll.results[0];
                    if (tableResult === null) {
                        ui.notifications.error(game.i18n.localize("RandomEncounter.BadRollTableError"));
                    }
                    else {
                        let text = tableResult.text;
                        if (tableResult.type == CONST.TABLE_RESULT_TYPES.TEXT) {
                            text = `<table><tr><td>${text}</td></tr></table>`;
                        }
                        else if (tableResult.type == CONST.TABLE_RESULT_TYPES.DOCUMENT) {
                            text = `<table><tr><td><img src="${tableResult.img}" width="30" height="30"></td><td>@UUID[${tableResult.documentCollection}.${tableResult.documentId}]{${text}}</td></tr></table>`;
                        }
                        else if (tableResult.type == CONST.TABLE_RESULT_TYPES.COMPENDIUM) {
                            text = `<table><tr><td><img src="${tableResult.img}" width="30" height="30"></td><td>@Compendium[${tableResult.documentCollection}.${tableResult.documentId}]{${text}}</td></tr></table>`;
                        }
                        RandomEncounter.printMessage(encounters[i].name, text);
                    }
                }
                if (!game.paused) {
                    game.togglePause(true, true);
                }
            }
            else {
                RandomEncounter.printMessage(encounters[i].name, "None");
            }
        }
    }
}

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class RandomEncounterCompendiumSettings extends HandlebarsApplicationMixin(ApplicationV2) {
    static DEFAULT_OPTIONS = {
        id: "random-encounters-compendiums",
        tag: "form",
        form: {
            handler: RandomEncounterCompendiumSettings.#onSubmitForm,
            submitOnChange: false,
            closeOnSubmit: true
        },
        window: {
            contentClasses: ["standard-form"],
            icon: "far fa-save",
            resizable: true,
            title: "RandomEncounter.compendium.name",
            width: 700,
            height: "auto"
        },
        position: {
            width: 700,
            height: "auto"
        }
    };

    static PARTS = {
        form: {
            template: "modules/random-encounters/templates/compendiums.html"
        }
    };

    async _prepareContext(options) {
        const context = await super._prepareContext(options);
        let saved_compendiums = game.settings.get("random-encounters", "compendiums");
        let compendiums = [];
        let sub = [];
        let packs = game.packs.filter((a) => a.metadata.type == "RollTable");
        for (var i = 0; i < packs.length; i++) {
            sub.push({
                id: packs[i].metadata.id.replace(".", "_"),
                label: packs[i].metadata.label,
                checked: saved_compendiums.includes(packs[i].metadata.id),
            });
            if ((i + 1) % 3 == 0) {
                compendiums.push(sub);
                sub = [];
            }
        }
        if (sub.length != 0) {
            compendiums.push(sub);
        }
        context.compendiums = compendiums;
        return context;
    }

    static async #onSubmitForm(event, form, formData) {
        const data = foundry.utils.expandObject(formData.object);
        let compendiums = [];
        for (let [key, value] of Object.entries(data)) {
            if (value) {
                compendiums.push(key.replace("_", "."));
            }
        }
        await game.settings.set("random-encounters", "compendiums", compendiums);
        this.render();
    }
}

export class RandomEncounterSettings extends HandlebarsApplicationMixin(ApplicationV2) {
    static DEFAULT_OPTIONS = {
        id: "random-encounters",
        tag: "form",
        form: {
            handler: RandomEncounterSettings.#onSubmitForm,
            submitOnChange: false,
            closeOnSubmit: false
        },
        actions: {
            addEncounter: RandomEncounterSettings.#onAddEncounter,
            removeEncounter: RandomEncounterSettings.#onRemoveEncounter,
            expandEncounter: RandomEncounterSettings.#expandEncounter
        },
        window: {
            contentClasses: ["standard-form"],
            icon: "far fa-cogs",
            resizable: true,
            title: "RandomEncounter.button.name",
            width: 700,
            height: "auto"
        },
        position: {
            width: 700,
            height: "auto"
        }
    };

    static PARTS = {
        form: {
            template: "modules/random-encounters/templates/encounters.html"
        }
    };

    async _prepareContext(options) {
        const context = await super._prepareContext(options);
        let encounters = game.settings.get("random-encounters", "encounters");
        for (var i = 0; i < encounters.length; i++) {
            encounters[i]["scenes"] = [];
            game.scenes.map((a) => a.name).forEach(function (name) {
                encounters[i]["scenes"].push({
                    name: name,
                    selected: name == encounters[i].scene,
                });
            });
            encounters[i]["daynight_options"] = [
                { name: "None", selected: false },
                { name: "Day", selected: false },
                { name: "Night", selected: false },
            ];
            for (var j = 0; j < encounters[i]["daynight_options"].length; j++) {
                if (encounters[i]["daynight_options"][j]["name"] == encounters[i].daynight) {
                    encounters[i]["daynight_options"][j]["selected"] = true;
                }
            }

            encounters[i]["rolltables"] = [];
            game.tables.map((a) => a.name).forEach(function (name) {
                encounters[i]["rolltables"].push({
                    name: name,
                    selected: name == encounters[i].rolltable,
                    compendium: null,
                });
            });

            let select_compendiums = game.settings.get("random-encounters", "compendiums");
            if (select_compendiums != null || select_compendiums != []) {
                let packs = game.packs.filter((a) => a.metadata.type == "RollTable").filter((b) => select_compendiums.includes(b.metadata.id));
                for (var j = 0; j < packs.length; j++) {
                    await packs[j].getIndex();
                    for (var [pack_key, value] of packs[j].index.entries()) {
                        let table = await packs[j].getDocument(value._id);
                        let name = packs[j].metadata.label + " - " + table.name;
                        encounters[i]["rolltables"].push({
                            name: name,
                            selected: name == encounters[i].rolltable,
                            compendium: packs[j].metadata.id,
                        });
                    }
                }
            }
        }
        context.encounters = encounters;
        return context;
    }

    static async #onSubmitForm(event, form, formData) {
        const data = foundry.utils.expandObject(formData.object);
        let encounters = [];

        for (let [key, value] of Object.entries(data)) {
            value.hidden = true;
            if (value.name == "") {
                ui.notifications.error(game.i18n.localize("RandomEncounter.SaveNameError"));
                value.hidden = false;
                return;
            }
            if (value.scene == "") {
                ui.notifications.error(game.i18n.localize("RandomEncounter.SaveSceneError"));
                value.hidden = false;
                return;
            }
            if (value.rolltable == "") {
                ui.notifications.error(game.i18n.localize("RandomEncounter.SaveRollTableError"));
                value.hidden = false;
                return;
            }
            var t_arr = value.rolltable.split(",");
            value.rolltable = t_arr[0];
            if (t_arr[1] != "") {
                value.compendium = t_arr[1];
            }
            if (value.timeout_id != null && (value.timeout_id !== undefined || value.timeout_id != 0)) {
                value.timeout_id = parseInt(value.timeout_id);
                await abouttime.clearTimeout(value.timeout_id);
                value.timeout_id = null;
            }
            if (value.time != "" && value.time != null) {
                if (!isNaN(value.time)) {
                    SimpleCalendar.api.startClock();
                    value.time = parseInt(value.time);
                    let doEncounter = async (encounter) => {
                        RandomEncounter.doRandomEncounters(encounter);
                    };
                    value.timeout_id = abouttime.doEvery({ minute: value.time }, doEncounter, value);
                }
                else {
                    ui.notifications.error(game.i18n.localize("RandomEncounter.TimeNaNError"));
                    value.hidden = false;
                    return;
                }
            }
            encounters.push(value);
        }
        await game.settings.set("random-encounters", "encounters", encounters);
        this.render();
    }

    static async #onAddEncounter(event, target) {
        let encounters = game.settings.get("random-encounters", "encounters");
        encounters.push({
            hidden: true,
            name: "",
            scene: "",
            rooms: "",
            time: null,
            daynight: "",
            chance: "",
            onresult: "",
            timeout_id: null,
            rolltable: "",
            compendium: null,
        });
        await game.settings.set("random-encounters", "encounters", encounters);
        this.render();
    }

    static async #onRemoveEncounter(event, target) {
        const idx = target.dataset.idx;
        let encounters = game.settings.get("random-encounters", "encounters");
        let rmEncounter = encounters[idx];
        if (rmEncounter.timeout_id) {
            await abouttime.clearTimeout(rmEncounter.timeout_id);
        }
        encounters.splice(idx, 1);
        await game.settings.set("random-encounters", "encounters", encounters);
        this.render();
    }

    static async #expandEncounter(event, target) {
        const idx = target.dataset.idx;
        let encounters = game.settings.get("random-encounters", "encounters");
        encounters[idx].hidden = !encounters[idx].hidden;
        await game.settings.set("random-encounters", "encounters", encounters);
        this.render();
    }
}

Hooks.on("init", () => {
    console.debug("random-encounters | register keybind settings");
    game.keybindings.register("random-encounters", "key", {
        name: "RandomEncounter.Keybind",
        hint: "RandomEncounter.KeybindHint",
        editable: [{key: "2", modifiers: ["Alt"]}],
        onDown: () => {
            console.debug("random-encounters | hotkey pressed");
            RandomEncounter.doRandomEncounters();
        },
        restricted: true,
        precedence: CONST.KEYBINDING_PRECEDENCE.NORMAL,
    });
});

Hooks.once("ready", async function () {
    if (!game.users.filter((a) => a.id == game.userId)[0].isGM) return true;
    console.debug("random-encounters | register settings");
    game.settings.registerMenu("random-encounters", "template", {
        name: "RandomEncounter.button.name",
        label: "RandomEncounter.button.label",
        hint: "RandomEncounter.button.hint",
        type: RandomEncounterSettings,
        restricted: true,
    });
    game.settings.registerMenu("random-encounters", "compendium-template", {
        name: "RandomEncounter.compendium.name",
        label: "RandomEncounter.compendium.label",
        hint: "RandomEncounter.compendium.hint",
        type: RandomEncounterCompendiumSettings,
        restricted: true,
    });
    game.settings.register("random-encounters", "encounters", {
        name: "",
        hint: "",
        scope: "world",
        config: false,
        default: [],
        type: Object,
    });
    game.settings.register("random-encounters", "compendiums", {
        name: "",
        hint: "",
        scope: "world",
        config: false,
        default: ["None"],
        type: Object,
    });

    game.settings.register("random-encounters", "brt", {
        name: "RandomEncounter.brt",
        hint: "RandomEncounter.brthint",
        scope: "world",
        config: game.modules.get("better-rolltables")?.active ?? false,
        default: game.modules.get("better-rolltables")?.active ?? false,
        type: Boolean,
    });

    var encounters = game.settings.get("random-encounters", "encounters")
        .filter((a) => a.timeout_id != null);
    if (encounters.length > 0) {
        console.log("random-encounters | starting game clock");
        SimpleCalendar.api.startClock();
    }
});

Hooks.once("setup", function () {
    console.debug("random-encounters | running setup hooks");
    var operations = {
        doRandomEncounters: RandomEncounter.doRandomEncounters,
    };
    game.RandomEncounter = operations;
    window.RandomEncounter = operations;
});