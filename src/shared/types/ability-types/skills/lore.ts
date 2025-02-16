import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";
import SkillSpellEffects from "@shared/types/ability-types/effects";

export class Lore implements IAbility {
    private static instance: Lore;

    name: string;
    helpFile: string;
    manualDescription?: string | undefined;
    duration?: number | undefined;
    effects?: SkillSpellEffects | undefined;
    group?: string | undefined;
    alternateKeyword?: string | undefined;
    recommendedHelpFileChanges?: string | undefined;
    abilityGroupType: AbilityGroupType;
    abilityUsage: AbilityUsage;

    constructor() {
        this.name = "Lore";
        this.abilityGroupType = AbilityGroupType.Skills;
        this.abilityUsage = AbilityUsage.Active;
        this.helpFile = `help lore
LORE
Lore is a general skill, consisting of knowledge of myths and legends. Use
of the lore skill gives a chance of obtaining information on an object,
concerning its power and uses.  It also may occasionally increase the value
of an object, because more will be known about its worth.  All classes may
learn lore, although thieves are best at it, and warriors find it very hard
to use.
Lore works automatically, each time you look at or examine an object.`;

        if (Lore.instance === undefined) {
            Lore.instance = this;
        }
    }
    
    // Method to get the single instance of the class
    public static GetInstance(): Lore {
        if (!Lore.instance) {
            Lore.instance = new Lore();
        }
        return Lore.instance;
    }

    // Method to get the class instance, used in the context of IAbility
    public Get<T>(): T {
        return Lore.GetInstance() as T;
    }
}

export default Lore;