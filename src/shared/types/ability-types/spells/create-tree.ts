import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class CreateTree implements IAbility {
  private static instance: CreateTree;

  name: string;
  manualDescription: string;
  recommendedHelpFileChanges: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;

  constructor() {
    this.name = this.constructor.name;
    this.manualDescription = `
Creates a tree
`;
    this.recommendedHelpFileChanges = "Include in 'help creation' and 'create tree'";
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;

    if (CreateTree.instance === undefined) {
      CreateTree.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): CreateTree {
    if (!CreateTree.instance) {
      CreateTree.instance = new CreateTree();
    }
    return CreateTree.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return CreateTree.GetInstance() as T;
  }
}

export default CreateTree;
