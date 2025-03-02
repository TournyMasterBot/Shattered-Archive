
import IAbility from "@shared/types/ability-types/ability";
import Creation from "@shared/types/ability-types/groups-spells/Creation";
import Illusion from "@shared/types/ability-types/groups-spells/Illusion";
import { IStatAttribute, StatAttribute, StatAttributeType } from "@shared/types/character-types/stat-attribute";
import BoostedClass from "@shared/types/character-types/boostedClass";
import IDamageType from "@shared/types/damage-types/damage-type-interface";
import IDslClass from "@shared/types/character-types/dslClass";
import { IRace } from "@shared/types/character-types/race-interface";

class TinkerGnome implements IRace {
    private static instance: TinkerGnome;
    
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
        this.id = "25";
        this.name = "tinkergnome";
        this.displayName = "Tinker Gnome";
        this.isLimitedRace = false;
        this.isMortalRace = true;
        this.isLargeRace = false;
        this.cpModifier = 5;
        this.stats = [
            new StatAttribute({
                type: StatAttributeType.Strength,
                modifier: 36
            }),
            new StatAttribute({
                type: StatAttributeType.Intelligence,
                modifier: 92
            }),
            new StatAttribute({
                type: StatAttributeType.Wisdom,
                modifier: 71
            }),
            new StatAttribute({
                type: StatAttributeType.Dexterity,
                modifier: 55
            }),
            new StatAttribute({
                type: StatAttributeType.Constitution,
                modifier: 46
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
            ...Illusion.GetInstance().Get<Illusion>().abilities,
            ...Creation.GetInstance().Get<Creation>().abilities
        ]
        this.availableClasses = [
            /*
            new Warrior(),
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
            new Enchantor(),
            new Mentalist(),
            new WuJen(),
            new Cleric(),
            new Crusader(),
            new Druid(),
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
            new Battlemage()
            */
        ];
        this.restrictedClasses = [
            /*var missingClasses = DslClassHelper.GetAvailableClasses().Where(x => !this.AvailableClasses.Any(y => y.Name == x.Name)).ToArray();
                return missingClasses.ToArray();*/
        ];
        this.boostedClasses = this.boostedClasses = new Map<IDslClass, BoostedClass[]>/*
            new IClassBoost(new Armsman(), -20, null, null),
            new IClassBoost(new Samurai(), -10, null, null),
            new IClassBoost(new Assassin(), -10, null, null),
            new IClassBoost(new Bandit(), -10, null, null),
            new IClassBoost(new Ninja(), -10, null, null),
            new IClassBoost(new Illusionist(), 10, null, null),
            new IClassBoost(new Enchantor(), 10, null, null),
            new IClassBoost(new Mentalist(), 20, null, null),
            new IClassBoost(new WuJen(), 10, null, null),
            new IClassBoost(new Shukenja(), -10, null, null),
            new IClassBoost(new Jongleur(), -10, null, null),
            new IClassBoost(new Charlatan(), -10, null, null),
        */;
        this.imageUrl = `https://shatteredarchive.com/img/races/TinkerGnome.png`
        this.description = `Gnomes originate from the eastern continent of Arkania.  There are two basic
types of gnomes, tinker and deep gnomes.  There are no visible differences
between the two, but their actions are very different.  Gnomes stand about 4
to 5 feet in height and are very intelligent.  They look most similar to the
Dwarven race, but couldn't act any more different if they tried.  Tinker
gnomes talk VERY fast and are always building or inventing something. 
Contraptions of the weirdest kind are made by tinker gnomes.  Their society
is based on what inventions they accomplish.  Tinker gnomes develop villages
in wooded areas or the valleys of hills.

Tinker gnomes get Illusion and Creation spellgroups for free`
    }
    
    // Method to get the single instance of the class
    public static GetInstance(): TinkerGnome {
        if (!TinkerGnome.instance) {
            TinkerGnome.instance = new TinkerGnome();
        }
        return TinkerGnome.instance;
    }

    // Method to get the class instance, used in the context of IAbility
    public Get<T>(): T {
        return TinkerGnome.GetInstance() as T;
    }
}

export default TinkerGnome;