import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";
import ContinualLight from "@shared/types/ability-types/spells/continual-light";
import CreateWater from "@shared/types/ability-types/spells/create-water";
import CreateHolySymbol from "@shared/types/ability-types/spells/create-holy-symbol";
import CreateFood from "@shared/types/ability-types/spells/create-food";
import CreateRose from "@shared/types/ability-types/spells/create-rose";
import CreateTree from "@shared/types/ability-types/spells/create-tree";
import CreateSpring from "@shared/types/ability-types/spells/create-spring";
import FloatingDisc from "@shared/types/ability-types/spells/floating-disc";
import Illumination from "@shared/types/ability-types/spells/illumination";
import ServerCache from "@shared/cache/server-cache";

export class Creation implements IAbilityGroup {
  static instance: Creation;
  public abilityGroup: AbilityGroup;
  public abilityGroupType: AbilityGroupType;
  public abilities: IAbility[];
  public name: string;

  constructor() {
    this.name = this.constructor.name;
    this.abilityGroup = AbilityGroup.Creation;
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilities = [
      ContinualLight.GetInstance(),
      CreateWater.GetInstance(),
      CreateHolySymbol.GetInstance(),
      CreateFood.GetInstance(),
      CreateRose.GetInstance(),
      CreateTree.GetInstance(),
      CreateSpring.GetInstance(),
      FloatingDisc.GetInstance(),
      Illumination.GetInstance(),
    ];
  }

  // Method to get the single instance of the class
  public static GetInstance(): Creation {
    if (!this.instance) {
      this.instance = new this();
      ServerCache.AbilityGroups[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Creation.GetInstance() as T;
  }
}

export default Creation;
