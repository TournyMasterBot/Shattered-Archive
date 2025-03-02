import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";
import AngelBasics from "./AngelBasics";
import Benedictions from "@shared/types/ability-types/groups-spells/Benedictions";
import Curative from "@shared/types/ability-types/groups-spells/Curative";
import Enhancement from "@shared/types/ability-types/groups-spells/Enhancement";
import HandToHand from "@shared/types/ability-types/skills/hand-to-hand";
import ServerCache from "@shared/cache/server-cache";

export class AngelDefault implements IAbilityGroup {
  static instance: AngelDefault;
  public abilityGroup: AbilityGroup;
  public abilityGroupType: AbilityGroupType;
  public abilities: IAbility[];
  public name: string;

  constructor() {
    this.name = this.constructor.name;
    this.abilityGroup = AbilityGroup.AngelDefault;
    this.abilityGroupType = AbilityGroupType.Default;
    this.abilities = [
      ...AngelBasics.GetInstance().abilities,
      ...Benedictions.GetInstance().abilities,
      ...Curative.GetInstance().abilities,
      ...Enhancement.GetInstance().abilities,
      HandToHand.GetInstance(),
    ];
  }

  // Method to get the single instance of the class
  public static GetInstance(): AngelDefault {
    if (!this.instance) {
      this.instance = new this();
      ServerCache.AbilityGroups[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return AngelDefault.GetInstance() as T;
  }
}

export default AngelDefault;
