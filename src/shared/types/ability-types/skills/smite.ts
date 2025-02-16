import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";
import SkillSpellEffects from "@shared/types/ability-types/effects";

export class Smite implements IAbility {
    private static instance: Smite;

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
        this.name = "Smite";
        this.abilityGroupType = AbilityGroupType.Skills;
        this.abilityUsage = AbilityUsage.Active;
        this.helpFile = `smite
Smite is a holy skill that paladins have learned, using their faith to
focus their strength into a powerful attack against their enemies.  

It hits somewhat hard, and also has a chance to blind them when the blood
from the wound runs into their eyes.  You need to use staffs, maces, or
spears.  Maces have the best chance to hit, then staffs, then spears. 
Spears do the most damage when the attack lands, then staffs, then maces. `;

        if (Smite.instance === undefined) {
            Smite.instance = this;
        }
    }
    
    // Method to get the single instance of the class
    public static GetInstance(): Smite {
        if (!Smite.instance) {
            Smite.instance = new Smite();
        }
        return Smite.instance;
    }

    // Method to get the class instance, used in the context of IAbility
    public Get<T>(): T {
        return Smite.GetInstance() as T;
    }
}

export default Smite;