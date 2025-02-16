import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class CreateSpring implements IAbility {
    private static instance: CreateSpring;

    name: string;
    helpFile: string;
    abilityGroupType: AbilityGroupType;
    abilityUsage: AbilityUsage;

    constructor() {
        this.name = "Create Spring";
        this.helpFile = `
help 'Create Spring'
'CREATE SPRING'
'CREATE SPRING'

Syntax: cast 'create spring'

This spell brings forth a magical spring from the ground, which has the same properties as a fountain.  

See also - CREATION 
`;
        this.abilityGroupType = AbilityGroupType.Spells;
        this.abilityUsage = AbilityUsage.Active;

        if (CreateSpring.instance === undefined) {
            CreateSpring.instance = this;
        }
    }

    // Method to get the single instance of the class
    public static GetInstance(): CreateSpring {
        if (!CreateSpring.instance) {
            CreateSpring.instance = new CreateSpring();
        }
        return CreateSpring.instance;
    }

    // Method to get the class instance, used in the context of IAbility
    public Get<T>(): T {
        return CreateSpring.GetInstance() as T;
    }
}

export default CreateSpring;