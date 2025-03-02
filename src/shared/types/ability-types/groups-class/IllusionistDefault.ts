import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";
import Beguiling from "../groups-spells/Beguiling";
import Combat from "../groups-spells/Combat";
import Detection from "../groups-spells/Detection";
import Enhancement from "@shared/types/ability-types/groups-spells/Enhancement";
import GreaterIllusions from "../groups-spells/GreaterIllusions";
import Illusion from "../groups-spells/Illusion";
import Maladictions from "../groups-spells/Maladictions";
import Protective from "../groups-spells/Protective";
import Transportation from "../groups-spells/Transportation";
import Astrology from "@shared/types/ability-types/skills/Astrology";
import ServerCache from "@shared/cache/server-cache";

export class IllusionistDefault implements IAbilityGroup {
  static instance: IllusionistDefault;
  public abilityGroup: AbilityGroup;
  public abilityGroupType: AbilityGroupType;
  public abilities: IAbility[];
  public name: string;

  constructor() {
    this.name = this.constructor.name;
    this.abilityGroup = AbilityGroup.IllusionistDefault;
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilities = [
      ...GreaterIllusions.GetInstance().abilities,
      ...Detection.GetInstance().abilities,
      ...Maladictions.GetInstance().abilities,
      ...Beguiling.GetInstance().abilities,
      ...Enhancement.GetInstance().abilities,
      ...Protective.GetInstance().abilities,
      ...Combat.GetInstance().abilities,
      ...Illusion.GetInstance().abilities,
      ...Transportation.GetInstance().abilities,
      Astrology.GetInstance(),
    ];
  }

  // Method to get the single instance of the class
  public static GetInstance(): IllusionistDefault {
    if (!this.instance) {
      this.instance = new this();
      ServerCache.AbilityGroups[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return IllusionistDefault.GetInstance() as T;
  }
}

export default IllusionistDefault;
