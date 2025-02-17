
import IAbility from "@shared/types/ability-types/ability";
import Berserk from "@shared/types/ability-types/skills/berserk";
import Toughness from "@shared/types/ability-types/skills/toughness";
import Infravision from "@shared/types/ability-types/spells/infravision";
import { IStatAttribute, StatAttribute, StatAttributeType } from "@shared/types/character-types/stat-attribute";
import PoisonDamageTypes from "@shared/types/damage-types/damage-type-group-models/groups-poison";
import BoostedClass from "@shared/types/character-types/boostedClass";
import IDamageType from "@shared/types/damage-types/damage-type-interface";
import IDslClass from "@shared/types/character-types/dslClass";
import { IRace } from "@shared/types/character-types/race-interface";

class DarkDwarf implements IRace {
    private static instance: DarkDwarf;
    
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
        this.id = "12";
        this.name = "darkdwarf";
        this.displayName = "Dark Dwarf";
        this.isLimitedRace = false;
        this.isMortalRace = true;
        this.isLargeRace = false;
        this.cpModifier = 10;
        this.stats = [
            new StatAttribute({
                type: StatAttributeType.Strength,
                modifier: 51
            }),
            new StatAttribute({
                type: StatAttributeType.Intelligence,
                modifier: 80
            }),
            new StatAttribute({
                type: StatAttributeType.Wisdom,
                modifier: 67
            }),
            new StatAttribute({
                type: StatAttributeType.Dexterity,
                modifier: 46
            }),
            new StatAttribute({
                type: StatAttributeType.Constitution,
                modifier: 61
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
        this.immunities = [];
        this.resistances = [
            ...PoisonDamageTypes.getAll()
        ];
        this.vulnerabilities = [
        ];
        this.racialAbilities = [
            Berserk.GetInstance().Get(),
            Toughness.GetInstance().Get(),
            Infravision.GetInstance().Get()
        ]
        this.availableClasses = [
            /*
            new Warrior(),
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
            new Shaman(),
            new Priest(),
            new Shukenja(),
            new Bard(),
            new Charlatan(),
            new Skald(),
            new Brewmaster(),
            new Monk(),
            new Dragonslayer(),
            new Invoker(),
            new Transmuter(),
            new Necromancer(),
            new Battlemage(),
            new Battlerager(),
            new Runesmith()
            */
        ];
        this.restrictedClasses = [
            /*var missingClasses = DslClassHelper.GetAvailableClasses().Where(x => !this.AvailableClasses.Any(y => y.Name == x.Name)).ToArray();
                return missingClasses.ToArray();*/
        ];
        this.boostedClasses = this.boostedClasses = new Map<IDslClass, BoostedClass[]>/*
            new IClassBoost(new Warrior(), -10, null, null),
            new IClassBoost(new Armsman(), -10, null, null),
            new IClassBoost(new Samurai(), -10, null, null),
            new IClassBoost(new Nightshade(), 10, null, null),
            new IClassBoost(new Ninja(), 10, null, null),
            new IClassBoost(new Mage(), 10, null, null),
            new IClassBoost(new Warlock(), 10, null, null),
            new IClassBoost(new Mentalist(), 10, null, null),
            new IClassBoost(new WuJen(), 10, null, null),
            new IClassBoost(new Cleric(), 10, null, null),
            new IClassBoost(new Priest(), 10, null, null),
            new IClassBoost(new Shukenja(), 20, null, null),
            new IClassBoost(new Brewmaster(), 10, null, null),
        */;
        this.imageUrl = `https://shatteredarchive.com/img/races/DarkDwarf.png`
        this.description = `Dwarves are short, stocky demi-humans, known for foul temper and great
stamina.  Dwarves have high strength and constitution, but poor dexterity. 
They are not as smart as humans, but are usually wiser due to their long
lifespans.  Dwarves make excellent fighters and priests, but are very poor
mages or thieves.

Dwarves are very resistant to poison and disease, but cannot swim, and so
are very vulnerable to drowning.  They receive the berserk skill for free
(if warriors), and can see in the dark with infravision.  

These dwarves dwell deep in the mountains of Thaxonos.  They are cruel and
vicious.  They worship the dark gods and are known to carry out cruel and
nasty acts.  They despise all races especially elves and dont necessarily
trust other Dwarves.  The Dark Dwarves are the only Dwarven race that
meddles in magic, though it is of a dark kind.  `
    }
    
    // Method to get the single instance of the class
    public static GetInstance(): DarkDwarf {
        if (!DarkDwarf.instance) {
            DarkDwarf.instance = new DarkDwarf();
        }
        return DarkDwarf.instance;
    }

    // Method to get the class instance, used in the context of IAbility
    public Get<T>(): T {
        return DarkDwarf.GetInstance() as T;
    }
}

export default DarkDwarf;