import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class DispelNeutral implements IAbility {
    private static instance: DispelNeutral;

    name: string;
    helpFile: string;
    abilityGroupType: AbilityGroupType;
    abilityUsage: AbilityUsage;

    constructor() {
        this.name = "Dispel Neutral";
        this.helpFile = `
help 'Dispel Neutral'
DISPEL NEUTRAL
DISPEL NEUTRAL

Syntax: cast 'dispel neutral' <target>

Dispel neutral calls forth the neutral energies of the universe to inflict
horrific torment on all of those whose alignment is not within the sphere of
neutrality. Good and evil-aligned characters who use this powerful magic do
so at their peril.

See also - ATTACK
`;
        this.abilityGroupType = AbilityGroupType.Spells;
        this.abilityUsage = AbilityUsage.Active;

        if (DispelNeutral.instance === undefined) {
            DispelNeutral.instance = this;
        }
    }

    // Method to get the single instance of the class
    public static GetInstance(): DispelNeutral {
        if (!DispelNeutral.instance) {
            DispelNeutral.instance = new DispelNeutral();
        }
        return DispelNeutral.instance;
    }

    // Method to get the class instance, used in the context of IAbility
    public Get<T>(): T {
        return DispelNeutral.GetInstance() as T;
    }
}

export default DispelNeutral;