import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";
import SkillSpellEffects from "@shared/types/ability-types/effects";

export class Pistol implements IAbility {
    private static instance: Pistol;

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
        this.name = "Pistol";
        this.abilityGroupType = AbilityGroupType.Skills;
        this.abilityUsage = AbilityUsage.Active;
        this.helpFile = `
help pistol
pistol ignite
PISTOL IGNITE

Syntax: ignite <target>

A pirate must have powder and pistol balls to fire a pistol at his or her opponent. To use the pistol, the pirate must first 'put powder pistol' then 'put ball pistol'. The pistol must then be wielded before the pirate can ignite.

If a pistol is misloaded, the ammunition will be consumed and the pirate may take damage. The pistol may also be destroyed. If the pirate attempts to switch to a weapon before the pistol fully ignites, the ammunition will be consumed and the pirate may take damage.
`;

        if (Pistol.instance === undefined) {
            Pistol.instance = this;
        }
    }

    // Method to get the single instance of the class
    public static GetInstance(): Pistol {
        if (!Pistol.instance) {
            Pistol.instance = new Pistol();
        }
        return Pistol.instance;
    }

    // Method to get the class instance, used in the context of IAbility
    public Get<T>(): T {
        return Pistol.GetInstance() as T;
    }
}

export default Pistol;