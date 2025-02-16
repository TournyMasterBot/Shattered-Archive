import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";
import SkillSpellEffects from "@shared/types/ability-types/effects";

export class Skewer implements IAbility {
    private static instance: Skewer;

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
        this.name = "Skewer";
        this.abilityGroupType = AbilityGroupType.Skills;
        this.abilityUsage = AbilityUsage.Active;
        this.helpFile = `help skewer
SKEWER
Skewer is a Shaman skill, allowing shamen to use their voodoo chants and
spear throwing ability to throw a spear from a distance and hold their
victims transfixed for a short amount of time.  The victim may try to escape
from the skewer, but will probably seriously wound themselves trying.  

syntax: skewer (direction) (target)
Must have a spear in inventory.`;

        if (Skewer.instance === undefined) {
            Skewer.instance = this;
        }
    }
    
    // Method to get the single instance of the class
    public static GetInstance(): Skewer {
        if (!Skewer.instance) {
            Skewer.instance = new Skewer();
        }
        return Skewer.instance;
    }

    // Method to get the class instance, used in the context of IAbility
    public Get<T>(): T {
        return Skewer.GetInstance() as T;
    }
}

export default Skewer;