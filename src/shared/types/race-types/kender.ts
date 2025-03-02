
import IAbility from "@shared/types/ability-types/ability";
import Dodge from "@shared/types/ability-types/skills/Dodge";
import Lore from "@shared/types/ability-types/skills/Lore";
import Peek from "@shared/types/ability-types/skills/Peek";
import PickLock from "@shared/types/ability-types/skills/PickLock";
import Sneak from "@shared/types/ability-types/skills/Sneak";
import Spear from "@shared/types/ability-types/skills/Spear";
import Staff from "@shared/types/ability-types/skills/Staff";
import Steal from "@shared/types/ability-types/skills/Steal";
import Taunt from "@shared/types/ability-types/skills/Taunt";
import { IStatAttribute, StatAttribute, StatAttributeType } from "@shared/types/character-types/stat-attribute";
import BoostedClass from "@shared/types/character-types/boostedClass";
import IDamageType from "@shared/types/damage-types/damage-type-interface";
import IDslClass from "@shared/types/character-types/dslClass";
import { IRace } from "@shared/types/character-types/race-interface";

class Kender implements IRace {
    private static instance: Kender;
    
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
        this.id = "30";
        this.name = "kender";
        this.displayName = "Kender";
        this.isLimitedRace = false;
        this.isMortalRace = true;
        this.isLargeRace = false;
        this.cpModifier = 5;
        this.stats = [
            new StatAttribute({
                type: StatAttributeType.Strength,
                modifier: 28
            }),
            new StatAttribute({
                type: StatAttributeType.Intelligence,
                modifier: 75
            }),
            new StatAttribute({
                type: StatAttributeType.Wisdom,
                modifier: 50
            }),
            new StatAttribute({
                type: StatAttributeType.Dexterity,
                modifier: 92
            }),
            new StatAttribute({
                type: StatAttributeType.Constitution,
                modifier: 28
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
            Dodge.GetInstance().Get(),
            Taunt.GetInstance().Get(),
            Sneak.GetInstance().Get(),
            Steal.GetInstance().Get(),
            PickLock.GetInstance().Get(),
            Peek.GetInstance().Get(),
            Lore.GetInstance().Get(),
            Staff.GetInstance().Get(),
            Spear.GetInstance().Get()
        ]
        this.availableClasses = [
            /*
            new Warrior(),
            new Ranger(),
            new Swashbuckler(),
            new Armsman(),
            new Samurai(),
            new Thief(),
            new Pirate(),
            new Nightshade(),
            new Ninja(),
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
            new Dragonslayer(),
            */
        ];
        this.restrictedClasses = [
            /*var missingClasses = DslClassHelper.GetAvailableClasses().Where(x => !this.AvailableClasses.Any(y => y.Name == x.Name)).ToArray();
                return missingClasses.ToArray();*/
        ];
        this.boostedClasses = this.boostedClasses = new Map<IDslClass, BoostedClass[]>/*
            new IClassBoost(new Warrior(), -10, null, null),
            new IClassBoost(new Armsman(), -20, null, null),
            new IClassBoost(new Samurai(), -20, null, null),
            new IClassBoost(new Thief(), 20, null, null),
            new IClassBoost(new Nightshade(), 20, null, null),
            new IClassBoost(new Thief(), 20, null, null),
            new IClassBoost(new Ninja(), 20, null, null),
            new IClassBoost(new Cleric(), -10, null, null),
            new IClassBoost(new Crusader(), -10, null, null),
            new IClassBoost(new Druid(), -10, null, null),
            new IClassBoost(new Priest(), -10, null, null),
            new IClassBoost(new Shukenja(), -10, null, null),
            new IClassBoost(new Bard(), 10, null, null),
            new IClassBoost(new Jongleur(), 10, null, null),
        */;
        this.imageUrl = `https://shatteredarchive.com/img/races/Kender.png`
        this.description = `Adult Kender resemble young teenage humans: Aside from their pointed ears,
they could pass as human youths.  Despite their attenuate limbs, kender are
well-muscled.  Most stand between 3'6" and 3'9" tall, although some few grow
to be up to four and a half feet.  Mature kender weigh between 85 and 105
pounds.  Typically, kender faces bear the intense, bright-eyed
inquisitiveness of children.  Happy kender grin madly; sad kender wear an
intractable pout.  When throwing taunts, kender look impish and shout in an
incredibly grating tone.  Their emotional intensity is infectious.  In their
countless pouches, pockets, and belt packs, kender carry a wide assortment
of junk.  Kender of all ages share a childlike nature: curious, fearless,
irrepressibly independent, lazy, taunting, and irresponsible with others
possessions.  

Kender receive pick lock for free due to it being one of a kender's most
passionate hobbies. They receive dodge for being so quick and nible. They,
of course, get peek for free as they can't seem to stay out of others
possessions.  The get sneak for being light-footed and taunt is a kender only
skill.`
    }
    
    // Method to get the single instance of the class
    public static GetInstance(): Kender {
        if (!Kender.instance) {
            Kender.instance = new Kender();
        }
        return Kender.instance;
    }

    // Method to get the class instance, used in the context of IAbility
    public Get<T>(): T {
        return Kender.GetInstance() as T;
    }
}

export default Kender;