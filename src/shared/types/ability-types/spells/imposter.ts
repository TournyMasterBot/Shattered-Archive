import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class Imposter implements IAbility {
    private static instance: Imposter;

    name: string;
    helpFile: string;
    abilityGroupType: AbilityGroupType;
    abilityUsage: AbilityUsage;
    manualDescription: string;

    constructor() {
        this.name = "Imposter";
        this.helpFile = `
help imposter
IMPOSTER
IMPOSTER

Imposter is an Illusionist spell that allows the user to take the form of
another player.  Use 'revert' to revert to your original self.  Caution is
advised however, because the transition from a morphed form to your original
form has been known to be tough to do.
`;
        this.manualDescription = "";
        this.abilityGroupType = AbilityGroupType.Spells;
        this.abilityUsage = AbilityUsage.Active;

        if (Imposter.instance === undefined) {
            Imposter.instance = this;
        }
    }

    // Method to get the single instance of the class
    public static GetInstance(): Imposter {
        if (!Imposter.instance) {
            Imposter.instance = new Imposter();
        }
        return Imposter.instance;
    }

    // Method to get the class instance, used in the context of IAbility
    public Get<T>(): T {
        return Imposter.GetInstance() as T;
    }
}

export default Imposter;