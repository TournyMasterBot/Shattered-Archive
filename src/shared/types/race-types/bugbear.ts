
import IAbility from "@shared/types/ability-types/ability";
import BugbearBite from "@shared/types/ability-types/skills/bugbear-bite";
import { IStatAttribute, StatAttribute, StatAttributeType } from "@shared/types/character-types/stat-attribute";
import BoostedClass from "@shared/types/character-types/boostedClass";
import IDamageType from "@shared/types/damage-types/damage-type-interface";
import IDslClass from "@shared/types/character-types/dslClass";
import { IRace } from "@shared/types/character-types/race-interface";

class Bugbear implements IRace {
    private static instance: Bugbear;
    
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
        this.id = "23";
        this.name = "bugbear";
        this.displayName = "Bugbear";
        this.isLimitedRace = false;
        this.isMortalRace = true;
        this.isLargeRace = true;
        this.cpModifier = 8.0;
        this.stats = [
            new StatAttribute({
                type: StatAttributeType.Strength,
                modifier: 78
            }),
            new StatAttribute({
                type: StatAttributeType.Intelligence,
                modifier: 49
            }),
            new StatAttribute({
                type: StatAttributeType.Wisdom,
                modifier: 49
            }),
            new StatAttribute({
                type: StatAttributeType.Dexterity,
                modifier: 46
            }),
            new StatAttribute({
                type: StatAttributeType.Constitution,
                modifier: 80
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
        this.resistances = [];
        this.vulnerabilities = [
        ];
        this.racialAbilities = [
            BugbearBite.GetInstance().Get()
        ]
        this.availableClasses = [
            /*
            new Warrior(),
            new Barbarian(),
            new Ranger(),
            new Armsman(),
            new Samurai(),
            new Thief(),
            new Bandit(),
            new Ninja(),
            new Cleric(),
            new Shaman(),
            new Shukenja(),
            new Monk(),
            new Dragonslayer(),
            */
        ];
        this.restrictedClasses = [
            /*var missingClasses = DslClassHelper.GetAvailableClasses().Where(x => !this.AvailableClasses.Any(y => y.Name == x.Name)).ToArray();
                return missingClasses.ToArray();*/
        ];
        this.boostedClasses = this.boostedClasses = new Map<IDslClass, BoostedClass[]>/*
            new IClassBoost(new Warrior(), 20, null, null),
            new IClassBoost(new Barbarian(), 20, null, null),
            new IClassBoost(new Ranger(), -10, null, null),
            new IClassBoost(new Samurai(), -10, null, null),
            new IClassBoost(new Ninja(), -10, null, null),
            new IClassBoost(new Cleric(), -10, null, null),
            new IClassBoost(new Shaman(), 10, null, null),
            new IClassBoost(new Shukenja(), -10, null, null),
        */;
        this.imageUrl = `https://shatteredarchive.com/img/races/Bugbear.png`
        this.description = `The biggest and strongest of the goblinoids, bugbears are even more
aggressive than their relatives.  They live by hunting any creature weaker
than themselves.  

Bugbears are large and very muscular, standing 7 feet tall.  Their hides
vary in color from light yellow to yellow brown, with thick course hair of
brown to brick red.  Their eyes resemble those of a savage animal, being
greenish-white with red pupils and they have wedge shaped ears.  A bugbears
mouth is full of long, sharp fangs, and it's nose is much like that of a
bear, with the same fine sense of smell.  This feature earned them their
name, though they are not related to bears.  Their tough hides and sharp
claws also resemble those of bears, but they are far more dexterous.  

Bugbears prefer to ambush opponents whenever possible.  Their combat tactics
are sound if not brilliant.  They are experts at moving silently, especially
for a large race.  Bugbears have two goals in life, food and treasure.  They
are often found commanding Goblins and Hobgoblins, whom they bully
mercilessly.  

Bugbears make great Warriors and Barbarians, and their Clerics and Shaman
tend to worship Raije due to their warlike culture or Devion due to their
respect for trickery.`
    }
    
    // Method to get the single instance of the class
    public static GetInstance(): Bugbear {
        if (!Bugbear.instance) {
            Bugbear.instance = new Bugbear();
        }
        return Bugbear.instance;
    }

    // Method to get the class instance, used in the context of IAbility
    public Get<T>(): T {
        return Bugbear.GetInstance() as T;
    }
}

export default Bugbear;