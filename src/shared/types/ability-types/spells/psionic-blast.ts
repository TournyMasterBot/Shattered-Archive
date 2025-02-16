import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class PsionicBlast implements IAbility {
    private static instance: PsionicBlast;

    name: string;
    helpFile: string;
    abilityGroupType: AbilityGroupType;
    abilityUsage: AbilityUsage;

    constructor() {
        this.name = "Psionic Blast";
        this.helpFile = `'PSIONIC BLAST'
Syntax: cast 'psionic blast' <target>
It is rumored that the Deep Gnomes have developed a defensive ability in
which they blast their opponents with a bolt of mental energy.
If the target is not specified, the blast will default to the opponent the deep
gnome is engaged in fighting with.`;
        this.abilityGroupType = AbilityGroupType.Spells;
        this.abilityUsage = AbilityUsage.Active;

        if (PsionicBlast.instance === undefined) {
            PsionicBlast.instance = this;
        }
    }

    // Method to get the single instance of the class
    public static GetInstance(): PsionicBlast {
        if (!PsionicBlast.instance) {
            PsionicBlast.instance = new PsionicBlast();
        }
        return PsionicBlast.instance;
    }

    // Method to get the class instance, used in the context of IAbility
    public Get<T>(): T {
        return PsionicBlast.GetInstance() as T;
    }
}

export default PsionicBlast;