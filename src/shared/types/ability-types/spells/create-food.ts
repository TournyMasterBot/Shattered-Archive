import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class CreateFood implements IAbility {
    private static instance: CreateFood;

    name: string;
    helpFile: string;
    abilityGroupType: AbilityGroupType;
    abilityUsage: AbilityUsage;

    constructor() {
        this.name = "Create Food";
        this.helpFile = `
help 'Create Food'
CREATE FOOD
Syntax: cast 'create food'

This spell creates a Magic Mushroom, which you or anyone else can eat.

See also - CREATION
`;
        this.abilityGroupType = AbilityGroupType.Spells;
        this.abilityUsage = AbilityUsage.Active;

        if (CreateFood.instance === undefined) {
            CreateFood.instance = this;
        }
    }

    // Method to get the single instance of the class
    public static GetInstance(): CreateFood {
        if (!CreateFood.instance) {
            CreateFood.instance = new CreateFood();
        }
        return CreateFood.instance;
    }

    // Method to get the class instance, used in the context of IAbility
    public Get<T>(): T {
        return CreateFood.GetInstance() as T;
    }
}

export default CreateFood;