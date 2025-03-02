
import IAbility from "@shared/types/ability-types/ability";
import PixieDust from "@shared/types/ability-types/skills/PixieDust";
import { IStatAttribute, StatAttribute, StatAttributeType } from "@shared/types/character-types/stat-attribute";
import ColdDamageTypes from "@shared/types/damage-types/damage-type-group-models/groups-cold";
import BoostedClass from "@shared/types/character-types/boostedClass";
import IDamageType from "@shared/types/damage-types/damage-type-interface";
import IDslClass from "@shared/types/character-types/dslClass";
import { IRace } from "@shared/types/character-types/race-interface";

class Pixie implements IRace {
    private static instance: Pixie;
    
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
        this.id = "38";
        this.name = "pixie";
        this.displayName = "Pixie";
        this.isLimitedRace = true;
        this.isMortalRace = true;
        this.isLargeRace = false;
        this.cpModifier = undefined;
        this.stats = [
            new StatAttribute({
                type: StatAttributeType.Strength,
                modifier: 24
            }),
            new StatAttribute({
                type: StatAttributeType.Intelligence,
                modifier: 88
            }),
            new StatAttribute({
                type: StatAttributeType.Wisdom,
                modifier: 70
            }),
            new StatAttribute({
                type: StatAttributeType.Dexterity,
                modifier: 94
            }),
            new StatAttribute({
                type: StatAttributeType.Constitution,
                modifier: 24
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
            ...ColdDamageTypes.getAll()
        ];
        this.racialAbilities = [
            PixieDust.GetInstance().Get()
        ]
        this.availableClasses = [
            /*
            new Thief(),
            new Assassin(),
            new Bandit(),
            new Pirate(),
            new Nightshade(),
            new Ninja(),
            new Mage(),
            new Illusionist(),
            new Enchantor(),
            new Mentalist(),
            new WuJen(),
            new Monk(),
            new Dragonslayer(),
            new Invoker(),
            new Transmuter(),
            new Necromancer(),
            new Battlemage()
            */
        ];
        this.restrictedClasses = [
            /*var missingClasses = DslClassHelper.GetAvailableClasses().Where(x => !this.AvailableClasses.Any(y => y.Name == x.Name)).ToArray();
                return missingClasses.ToArray();*/
        ];
        this.boostedClasses = this.boostedClasses = new Map<IDslClass, BoostedClass[]>/*
            new IClassBoost(new Ninja(), -20, null, null),
            new IClassBoost(new Mage(), 20, null, null),
            new IClassBoost(new Illusionist(), 20, null, null),
            new IClassBoost(new Mentalist(), 10, null, null),
            new IClassBoost(new Shukenja(), 10, null, null),
            new IClassBoost(new Dragonslayer(), -10, null, null),
        */;
        this.imageUrl = `https://shatteredarchive.com/img/races/Pixie.png`
        this.description = `Pixies stand at only two feet tall and have fluttering wings.  These
creatures are usually spotted flying rather than standing.  They have odd
bright colored eyes and hair and tend to cause as much mischief as the
Kender do.  Pixies generate a golden dust known as "pixie dust" which has
very strong natural magical properties. It is said that getting pixie
dust on you can have very weird and random effects.  

Pixies are native to the continent of Tropica and have been driven out of
their wooden homelands by the forces of Chaos.  
 
Pixies cannot be Warriors, Bards or Clerics, Assassins, Bandits or Witches/Warlock.`
    }
    
    // Method to get the single instance of the class
    public static GetInstance(): Pixie {
        if (!Pixie.instance) {
            Pixie.instance = new Pixie();
        }
        return Pixie.instance;
    }

    // Method to get the class instance, used in the context of IAbility
    public Get<T>(): T {
        return Pixie.GetInstance() as T;
    }
}

export default Pixie;