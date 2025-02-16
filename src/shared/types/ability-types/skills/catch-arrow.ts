import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class CatchArrow implements IAbility {
    private static instance: CatchArrow;

    name: string;
    helpFile: string;
    abilityGroupType: AbilityGroupType;
    abilityUsage: AbilityUsage;
    manualDescription: string;

    constructor() {
        this.name = "Catch Arrow";
        this.helpFile = `
CATCH ARROW
 
With an impressive display of hand-eye coordination, the trained jongleur 
is able to not only see his enemy's shot heading toward him, but also grab 
it out of the air before it can strike him.  This is a passive skill.

Groups containing this skill: JONGLEUR DEFAULT
`;
        this.abilityGroupType = AbilityGroupType.Skills;
        this.abilityUsage = AbilityUsage.Passive;
        this.manualDescription = "";

        if (CatchArrow.instance === undefined) {
            CatchArrow.instance = this;
        }
    }

    // Method to get the single instance of the class
    public static GetInstance(): CatchArrow {
        if (!CatchArrow.instance) {
            CatchArrow.instance = new CatchArrow();
        }
        return CatchArrow.instance;
    }

    // Method to get the class instance, used in the context of IAbility
    public Get<T>(): T {
        return CatchArrow.GetInstance() as T;
    }
}

export default CatchArrow;