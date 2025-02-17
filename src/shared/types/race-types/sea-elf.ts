
import IAbility from "@shared/types/ability-types/ability";
import DolphinForm from "@shared/types/ability-types/skills/dolphin-form";
import Sneak from "@shared/types/ability-types/skills/sneak";
import Infravision from "@shared/types/ability-types/spells/infravision";
import { IStatAttribute, StatAttribute, StatAttributeType } from "@shared/types/character-types/stat-attribute";
import BoostedClass from "@shared/types/character-types/boostedClass";
import IDamageType from "@shared/types/damage-types/damage-type-interface";
import IDslClass from "@shared/types/character-types/dslClass";
import { IRace } from "@shared/types/character-types/race-interface";

class SeaElf implements IRace {
    private static instance: SeaElf;
    
    public id: string;
    public imageUrl: string;
    public description?: string | undefined;
    public cpModifier?: number | undefined;
    public name: string;
    public displayName: string;
    public isLimitedRace: boolean;
    public isMortalRace: boolean;
    public isLargeRace: boolean;
    public stats: IStatAttribute[];
    public primaryAttributeModifier: IStatAttribute;
    public secondaryAttributeModifier: IStatAttribute;
    public immunities: IDamageType[];
    public resistances: IDamageType[];
    public vulnerabilities: IDamageType[];
    public racialAbilities: IAbility[];
    public availableClasses: IDslClass[];
    public restrictedClasses: IDslClass[];
    public boostedClasses: Map<IDslClass, BoostedClass[]>;

    constructor() {
        this.id = "5";
        this.name = "seaelf";
        this.displayName = "Sea Elf";
        this.isLimitedRace = false;
        this.isMortalRace = true;
        this.isLargeRace = false;
        this.cpModifier = 5;
        this.stats = [
            new StatAttribute({
                type: StatAttributeType.Strength,
                modifier: 40
            }),
            new StatAttribute({
                type: StatAttributeType.Intelligence,
                modifier: 76
            }),
            new StatAttribute({
                type: StatAttributeType.Wisdom,
                modifier: 72
            }),
            new StatAttribute({
                type: StatAttributeType.Dexterity,
                modifier: 70
            }),
            new StatAttribute({
                type: StatAttributeType.Constitution,
                modifier: 44
            })
        ]
        this.primaryAttributeModifier = new StatAttribute({
            type: StatAttributeType.Variable,
            modifier: 8
        });
        this.secondaryAttributeModifier = new StatAttribute({
            type: StatAttributeType.Variable,
            modifier: 4
        });
        this.immunities = [
        ];
        this.resistances = [
        ];
        this.vulnerabilities = [
        ];
        this.racialAbilities = [
            Sneak.GetInstance().Get(),
            DolphinForm.GetInstance().Get(),
            Infravision.GetInstance().Get()
        ]
        this.availableClasses = [
            /*
            new Warrior(),
            new Barbarian(),
            new Ranger(),
            new Swashbuckler(),
            new Armsman(),
            new Samurai(),
            new Thief(),
            new Assassin(),
            new Bandit(),
            new Pirate(),
            new Nightshade(),
            new Ninja(),
            new Mage(),
            new Illusionist(),
            new Witch(),
            new Warlock(),
            new Enchantor(),
            new Mentalist(),
            new WuJen(),
            new Cleric(),
            new Crusader(),
            new Druid(),
            new Shaman(),
            new Priest(),
            new Shukenja(),
            new Bard(),
            new Jongleur(),
            new Charlatan(),
            new Skald(),
            new Brewmaster(),
            new Monk(),
            new Dragonslayer(),
            new Invoker(),
            new Transmuter(),
            new Necromancer(),
            new Battlemage(),
            new Bladesinger(),
            new Eldritch()
            */
        ];
        this.restrictedClasses = [
            /*var missingClasses = DslClassHelper.GetAvailableClasses().Where(x => !this.AvailableClasses.Any(y => y.Name == x.Name)).ToArray();
                return missingClasses.ToArray();*/
        ];
        this.boostedClasses = this.boostedClasses = new Map<IDslClass, BoostedClass[]>/*
            new IClassBoost(new Warrior(), -10, null, null),
            new IClassBoost(new Ranger(), 10, null, null),
            new IClassBoost(new Swashbuckler(), 10, null, null),
            new IClassBoost(new Armsman(), -10, null, null),
            new IClassBoost(new Bandit(), -10, null, null),
            new IClassBoost(new Ninja(), 10, null, null),
            new IClassBoost(new Mage(), 10, null, null),
            new IClassBoost(new Illusionist(), 10, null, null),
            new IClassBoost(new Warlock(), -10, null, null),
            new IClassBoost(new Enchantor(), 10, null, null),
            new IClassBoost(new Mentalist(), 10, null, null),
            new IClassBoost(new WuJen(), 20, null, null),
            new IClassBoost(new Cleric(), 10, null, null),
            new IClassBoost(new Druid(), 10, null, null),
            new IClassBoost(new Shukenja(), 10, null, null),
            new IClassBoost(new Charlatan(), -10, null, null),
            new IClassBoost(new Dragonslayer(), 10, null, null),
        */;
        this.imageUrl = `https://shatteredarchive.com/img/races/SeaElf.png`
        this.description = `he Sea Elves are barbaric aquatic creatures who appear quite different from
their elven cousins.  These races have rubbery bluish skin, wide eyes with
narrow pupils, webbed fingers and toes.  Although they swim well in their
elvish form, they can also take the shape of Dolphins.`
    }
    
    // Method to get the single instance of the class
    public static GetInstance(): SeaElf {
        if (!SeaElf.instance) {
            SeaElf.instance = new SeaElf();
        }
        return SeaElf.instance;
    }

    // Method to get the class instance, used in the context of IAbility
    public Get<T>(): T {
        return SeaElf.GetInstance() as T;
    }
}

export default SeaElf;